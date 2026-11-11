// The data the stories show: Mealdrop's stub restaurants, categories and cart, in the shapes of
// `shapes.contract`. Contract has no optional fields, so every field is here: a restaurant without a
// rating has 0, an item without a description has "".

export interface FoodMenuItem {
  id: number;
  name: string;
  description: string;
  price: number;
}

export interface Menu {
  food: FoodMenuItem[];
  dessert: FoodMenuItem[];
  drinks: FoodMenuItem[];
}

export interface Restaurant {
  id: string;
  name: string;
  specialty: string;
  photoUrl: string;
  rating: number;
  categories: string[];
  isNew: boolean;
  isClosed: boolean;
  menu: Menu;
}

export interface CartItem extends FoodMenuItem {
  quantity: number;
}

export interface Category {
  id: string;
  title: string;
  photoUrl: string;
}

export const restaurants: Restaurant[] = [
  {
    "id": "1",
    "name": "Burger Kingdom",
    "specialty": "Nicest place for burgers",
    "photoUrl": "https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=1003&q=20",
    "rating": 4.2,
    "categories": [
      "burgers",
      "comfort food"
    ],
    "isNew": false,
    "isClosed": false,
    "menu": {
      "food": [
        {
          "id": 1,
          "name": "Cheeseburger",
          "description": "Nice grilled burger with cheese",
          "price": 8.5
        },
        {
          "id": 2,
          "name": "Fries",
          "description": "Fried french fries",
          "price": 2.5
        }
      ],
      "dessert": [
        {
          "id": 3,
          "name": "Vanilla ice cream",
          "description": "Ice cream",
          "price": 2
        }
      ],
      "drinks": [
        {
          "id": 4,
          "name": "Coca-Cola",
          "description": "",
          "price": 1.75
        },
        {
          "id": 5,
          "name": "Fanta",
          "description": "",
          "price": 1.5
        },
        {
          "id": 6,
          "name": "Sprite",
          "description": "",
          "price": 1.5
        }
      ]
    }
  },
  {
    "id": "2",
    "name": "Kara Fin",
    "specialty": "Sarma (wine leafs with rice)",
    "photoUrl": "https://images.pexels.com/photos/1058277/pexels-photo-1058277.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260",
    "rating": 0,
    "categories": [
      "burgers",
      "pizza"
    ],
    "isNew": false,
    "isClosed": false,
    "menu": {
      "food": [
        {
          "id": 1,
          "name": "Cheeseburger",
          "description": "Nice grilled burger with cheese",
          "price": 8.5
        },
        {
          "id": 2,
          "name": "Fries",
          "description": "Fried french fries",
          "price": 2.5
        }
      ],
      "dessert": [
        {
          "id": 3,
          "name": "Vanilla ice cream",
          "description": "Ice cream",
          "price": 2
        }
      ],
      "drinks": [
        {
          "id": 4,
          "name": "Coca-Cola",
          "description": "",
          "price": 1.75
        },
        {
          "id": 5,
          "name": "Fanta",
          "description": "",
          "price": 1.5
        },
        {
          "id": 6,
          "name": "Sprite",
          "description": "",
          "price": 1.5
        }
      ]
    }
  },
  {
    "id": "3",
    "name": "De Oliewinkel",
    "specialty": "Olive oil",
    "photoUrl": "https://duyt4h9nfnj50.cloudfront.net/search_home/FastFood.jpg",
    "rating": 0,
    "categories": [
      "comfort food"
    ],
    "isNew": false,
    "isClosed": true,
    "menu": {
      "food": [
        {
          "id": 1,
          "name": "Cheeseburger",
          "description": "Nice grilled burger with cheese",
          "price": 8.5
        },
        {
          "id": 2,
          "name": "Fries",
          "description": "Fried french fries",
          "price": 2.5
        }
      ],
      "dessert": [
        {
          "id": 3,
          "name": "Vanilla ice cream",
          "description": "Ice cream",
          "price": 2
        }
      ],
      "drinks": [
        {
          "id": 4,
          "name": "Coca-Cola",
          "description": "",
          "price": 1.75
        },
        {
          "id": 5,
          "name": "Fanta",
          "description": "",
          "price": 1.5
        },
        {
          "id": 6,
          "name": "Sprite",
          "description": "",
          "price": 1.5
        }
      ]
    }
  },
  {
    "id": "4",
    "name": "'t Kuyltje",
    "specialty": "Pastrami sandwiches",
    "photoUrl": "https://duyt4h9nfnj50.cloudfront.net/search_home/FastFood.jpg",
    "rating": 0,
    "categories": [
      "comfort food"
    ],
    "isNew": true,
    "isClosed": false,
    "menu": {
      "food": [
        {
          "id": 1,
          "name": "Cheeseburger",
          "description": "Nice grilled burger with cheese",
          "price": 8.5
        },
        {
          "id": 2,
          "name": "Fries",
          "description": "Fried french fries",
          "price": 2.5
        }
      ],
      "dessert": [
        {
          "id": 3,
          "name": "Vanilla ice cream",
          "description": "Ice cream",
          "price": 2
        }
      ],
      "drinks": [
        {
          "id": 4,
          "name": "Coca-Cola",
          "description": "",
          "price": 1.75
        },
        {
          "id": 5,
          "name": "Fanta",
          "description": "",
          "price": 1.5
        },
        {
          "id": 6,
          "name": "Sprite",
          "description": "",
          "price": 1.5
        }
      ]
    }
  },
  {
    "id": "5",
    "name": "Ciao Bella",
    "specialty": "Takeaway lasagna",
    "photoUrl": "https://images.pexels.com/photos/6267/menu-restaurant-vintage-table.jpg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260",
    "rating": 0,
    "categories": [
      "pizza"
    ],
    "isNew": true,
    "isClosed": false,
    "menu": {
      "food": [
        {
          "id": 1,
          "name": "Cheeseburger",
          "description": "Nice grilled burger with cheese",
          "price": 8.5
        },
        {
          "id": 2,
          "name": "Fries",
          "description": "Fried french fries",
          "price": 2.5
        }
      ],
      "dessert": [
        {
          "id": 3,
          "name": "Vanilla ice cream",
          "description": "Ice cream",
          "price": 2
        }
      ],
      "drinks": [
        {
          "id": 4,
          "name": "Coca-Cola",
          "description": "",
          "price": 1.75
        },
        {
          "id": 5,
          "name": "Fanta",
          "description": "",
          "price": 1.5
        },
        {
          "id": 6,
          "name": "Sprite",
          "description": "",
          "price": 1.5
        }
      ]
    }
  },
  {
    "id": "6",
    "name": "Soup Eno",
    "specialty": "Spinach soup",
    "photoUrl": "https://duyt4h9nfnj50.cloudfront.net/search_home/FastFood.jpg",
    "rating": 0,
    "categories": [
      "asian"
    ],
    "isNew": false,
    "isClosed": false,
    "menu": {
      "food": [
        {
          "id": 1,
          "name": "Cheeseburger",
          "description": "Nice grilled burger with cheese",
          "price": 8.5
        },
        {
          "id": 2,
          "name": "Fries",
          "description": "Fried french fries",
          "price": 2.5
        }
      ],
      "dessert": [
        {
          "id": 3,
          "name": "Vanilla ice cream",
          "description": "Ice cream",
          "price": 2
        }
      ],
      "drinks": [
        {
          "id": 4,
          "name": "Coca-Cola",
          "description": "",
          "price": 1.75
        },
        {
          "id": 5,
          "name": "Fanta",
          "description": "",
          "price": 1.5
        },
        {
          "id": 6,
          "name": "Sprite",
          "description": "",
          "price": 1.5
        }
      ]
    }
  },
  {
    "id": "7",
    "name": "Warung Atika",
    "specialty": "€6 meals",
    "photoUrl": "https://duyt4h9nfnj50.cloudfront.net/search_home/FastFood.jpg",
    "rating": 0,
    "categories": [
      "sushi",
      "asian"
    ],
    "isNew": false,
    "isClosed": false,
    "menu": {
      "food": [
        {
          "id": 1,
          "name": "Cheeseburger",
          "description": "Nice grilled burger with cheese",
          "price": 8.5
        },
        {
          "id": 2,
          "name": "Fries",
          "description": "Fried french fries",
          "price": 2.5
        }
      ],
      "dessert": [
        {
          "id": 3,
          "name": "Vanilla ice cream",
          "description": "Ice cream",
          "price": 2
        }
      ],
      "drinks": [
        {
          "id": 4,
          "name": "Coca-Cola",
          "description": "",
          "price": 1.75
        },
        {
          "id": 5,
          "name": "Fanta",
          "description": "",
          "price": 1.5
        },
        {
          "id": 6,
          "name": "Sprite",
          "description": "",
          "price": 1.5
        }
      ]
    }
  },
  {
    "id": "8",
    "name": "Yuan's Hot Pot",
    "specialty": "cheap and fun evening meals",
    "photoUrl": "https://duyt4h9nfnj50.cloudfront.net/search_home/FastFood.jpg",
    "rating": 0,
    "categories": [
      "thai"
    ],
    "isNew": false,
    "isClosed": false,
    "menu": {
      "food": [
        {
          "id": 1,
          "name": "Cheeseburger",
          "description": "Nice grilled burger with cheese",
          "price": 8.5
        },
        {
          "id": 2,
          "name": "Fries",
          "description": "Fried french fries",
          "price": 2.5
        }
      ],
      "dessert": [
        {
          "id": 3,
          "name": "Vanilla ice cream",
          "description": "Ice cream",
          "price": 2
        }
      ],
      "drinks": [
        {
          "id": 4,
          "name": "Coca-Cola",
          "description": "",
          "price": 1.75
        },
        {
          "id": 5,
          "name": "Fanta",
          "description": "",
          "price": 1.5
        },
        {
          "id": 6,
          "name": "Sprite",
          "description": "",
          "price": 1.5
        }
      ]
    }
  },
  {
    "id": "9",
    "name": "BAK",
    "specialty": "expensive dinners",
    "photoUrl": "https://duyt4h9nfnj50.cloudfront.net/search_home/FastFood.jpg",
    "rating": 0,
    "categories": [
      "indian"
    ],
    "isNew": false,
    "isClosed": false,
    "menu": {
      "food": [
        {
          "id": 1,
          "name": "Cheeseburger",
          "description": "Nice grilled burger with cheese",
          "price": 8.5
        },
        {
          "id": 2,
          "name": "Fries",
          "description": "Fried french fries",
          "price": 2.5
        }
      ],
      "dessert": [
        {
          "id": 3,
          "name": "Vanilla ice cream",
          "description": "Ice cream",
          "price": 2
        }
      ],
      "drinks": [
        {
          "id": 4,
          "name": "Coca-Cola",
          "description": "",
          "price": 1.75
        },
        {
          "id": 5,
          "name": "Fanta",
          "description": "",
          "price": 1.5
        },
        {
          "id": 6,
          "name": "Sprite",
          "description": "",
          "price": 1.5
        }
      ]
    }
  },
  {
    "id": "10",
    "name": "FOER",
    "specialty": "expensive dinners",
    "photoUrl": "https://images.pexels.com/photos/6267/menu-restaurant-vintage-table.jpg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260",
    "rating": 0,
    "categories": [
      "comfort food"
    ],
    "isNew": false,
    "isClosed": false,
    "menu": {
      "food": [
        {
          "id": 1,
          "name": "Cheeseburger",
          "description": "Nice grilled burger with cheese",
          "price": 8.5
        },
        {
          "id": 2,
          "name": "Fries",
          "description": "Fried french fries",
          "price": 2.5
        }
      ],
      "dessert": [
        {
          "id": 3,
          "name": "Vanilla ice cream",
          "description": "Ice cream",
          "price": 2
        }
      ],
      "drinks": [
        {
          "id": 4,
          "name": "Coca-Cola",
          "description": "",
          "price": 1.75
        },
        {
          "id": 5,
          "name": "Fanta",
          "description": "",
          "price": 1.5
        },
        {
          "id": 6,
          "name": "Sprite",
          "description": "",
          "price": 1.5
        }
      ]
    }
  }
];

export const categories: Category[] = [
  {
    "id": "pizza",
    "title": "Pizza",
    "photoUrl": "https://images.pexels.com/photos/2147491/pexels-photo-2147491.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=550"
  },
  {
    "id": "burgers",
    "title": "Burgers",
    "photoUrl": "https://images.pexels.com/photos/2233351/pexels-photo-2233351.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=550"
  },
  {
    "id": "desserts",
    "title": "Desserts",
    "photoUrl": "https://images.pexels.com/photos/1343465/pexels-photo-1343465.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=550"
  },
  {
    "id": "comfort-food",
    "title": "Comfort food",
    "photoUrl": "https://images.pexels.com/photos/1199960/pexels-photo-1199960.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=550"
  },
  {
    "id": "sushi",
    "title": "Sushi",
    "photoUrl": "https://images.pexels.com/photos/9210/food-japanese-food-photography-sushi.jpg?auto=compress&cs=tinysrgb&dpr=2&h=550"
  },
  {
    "id": "asian",
    "title": "Asian",
    "photoUrl": "https://images.pexels.com/photos/1234535/pexels-photo-1234535.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=550"
  }
];

export const cartItems: CartItem[] = [
  {
    "id": 2,
    "name": "Fries",
    "description": "Fried french fries",
    "price": 2.5,
    "quantity": 1
  },
  {
    "id": 1,
    "name": "Cheeseburger",
    "description": "Nice grilled burger with cheese",
    "price": 8.5,
    "quantity": 1
  },
  {
    "id": 3,
    "name": "Vanilla ice cream",
    "description": "Ice cream",
    "price": 2,
    "quantity": 1
  },
  {
    "id": 4,
    "name": "Coca-Cola",
    "description": "",
    "price": 1.75,
    "quantity": 1
  },
  {
    "id": 5,
    "name": "Fanta",
    "description": "",
    "price": 1.5,
    "quantity": 1
  },
  {
    "id": 6,
    "name": "Sprite",
    "description": "",
    "price": 1.5,
    "quantity": 1
  }
];
