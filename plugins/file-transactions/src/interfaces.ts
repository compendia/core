export interface IDatabaseItem {
    schema: string;
    hash: string;
    owner: {
        address: string;
        username: string;
    };
}
