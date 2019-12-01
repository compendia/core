module.exports = {
    cli: {
        core: {
            run: {
                plugins: {
                    include: ["@arkecosystem/core-magistrate-transactions", "@nosplatform/stake-transactions"],
                },
            },
        },
        relay: {
            run: {
                plugins: {
                    include: ["@arkecosystem/core-magistrate-transactions", "@nosplatform/stake-transactions"],
                },
            },
        },
        forger: {
            run: {
                plugins: {
                    include: ["@arkecosystem/core-magistrate-transactions", "@nosplatform/stake-transactions"],
                },
            },
        },
        chain: {
            run: {
                plugins: {
                    include: ["@arkecosystem/core-magistrate-transactions", "@nosplatform/stake-transactions"],
                },
            },
        },
        snapshot: {
            run: {
                plugins: {
                    include: ["@arkecosystem/core-magistrate-transactions", "@nosplatform/stake-transactions"],
                },
            },
        },
    },
}