module.exports = {
    cli: {
        core: {
            run: {
                plugins: {
                    include: ["@nosplatform/stake-transactions", "@nosplatform/file-transactions"],
                },
            },
        },
        relay: {
            run: {
                plugins: {
                    include: ["@nosplatform/stake-transactions", "@nosplatform/file-transactions"],
                },
            },
        },
        forger: {
            run: {
                plugins: {
                    include: ["@nosplatform/stake-transactions", "@nosplatform/file-transactions"],
                },
            },
        },
        chain: {
            run: {
                plugins: {
                    include: ["@nosplatform/stake-transactions", "@nosplatform/file-transactions"],
                },
            },
        },
        snapshot: {
            run: {
                plugins: {
                    include: ["@nosplatform/stake-transactions", "@nosplatform/file-transactions"],
                },
            },
        },
    },
}