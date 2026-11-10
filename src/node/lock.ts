// One build at a time per app, across processes: a dev server and a static build of the same app (or two dev
// servers) share the shadow and the build directory, and Exact's build empties its output directory first.
import { mkdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STALE_MS = 30_000;
const BEAT_MS = 5_000;
const WAIT_MS = 5 * 60_000;

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Whether the lock's holder is gone: its process ended, or it stopped refreshing the lock. */
function abandoned(lock: string): boolean {
  try {
    const pid = Number(readFileSync(join(lock, 'pid'), 'utf8'));
    if (pid && !alive(pid)) return true;
  } catch {
    // The holder is between making the directory and writing its pid.
  }
  try {
    return Date.now() - statSync(lock).mtimeMs > STALE_MS;
  } catch {
    return false;
  }
}

export async function withLock<T>(directory: string, work: () => Promise<T>): Promise<T> {
  mkdirSync(directory, { recursive: true });
  const lock = join(directory, 'build.lock');
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (abandoned(lock)) {
        rmSync(lock, { recursive: true, force: true });
        continue;
      }
      if (Date.now() > deadline) throw new Error(`Another Storybook has held the build lock at ${lock} for over five minutes. Delete it if no build is running.`);
      await new Promise((resume) => setTimeout(resume, 50));
    }
  }
  writeFileSync(join(lock, 'pid'), String(process.pid));
  const beat = setInterval(() => {
    try {
      utimesSync(lock, new Date(), new Date());
    } catch {
      // released
    }
  }, BEAT_MS);
  try {
    return await work();
  } finally {
    clearInterval(beat);
    rmSync(lock, { recursive: true, force: true });
  }
}
