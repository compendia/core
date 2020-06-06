export const defaults = {
    apiSync: false,
    enabled: false,
    fetchTransactions: true,
    tor: {
        enabled: true,
        instances: {
            max: 10,
            min: 3
        },
        path: undefined
    }
};
