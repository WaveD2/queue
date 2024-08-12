// types.ts
export interface Product {
    id: string;
    name: string;
    price: number;
}

export interface Order {
    id: string;
    productId: string;
    quantity: number;
    totalPrice: number;
}