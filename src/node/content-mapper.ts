// The process TypeScript starts for a project's `.contract` files: see mapper.ts.
import { serve } from './mapper.ts';

serve(process.stdin, process.stdout);
