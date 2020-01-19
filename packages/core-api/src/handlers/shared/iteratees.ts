export const blockIteratees = [
    "height",
    "id",
    "numberOfTransactions",
    "payloadHash",
    "payloadLength",
    "previousBlock",
    "reward",
    "timestamp",
    "totalAmount",
    "totalFee",
    "version",
];

export const bridgechainIteratees = [
    "address",
    "bridgechainRepository",
    "genesisHash",
    "isResigned",
    "name",
    "publicKey",
];

export const businessIteratees = ["address", "isResigned", "name", "publicKey", "repository", "vat", "website"];

export const delegateIteratees = [
    "approval",
    "forgedFees",
    "forgedRewards",
    "forgedTotal",
    "producedBlocks",
    "publicKey",
    "rank",
    "resigned",
    "username",
    "voteBalance",
    "votes",
];

export const lockIteratees = [
    "amount",
    "expirationType",
    "expirationValue",
    "isExpired",
    "lockId",
    "recipientId",
    "secretHash",
    "senderPublicKey",
    "timestamp",
    "vendorField",
];

export const peerIteratees = ["height", "ip", "latency", "version"];

export const transactionIteratees = [
    "amount",
    "blockId",
    "fee",
    "id",
    "nonce",
    "recipientId",
    "senderPublicKey",
    "timestamp",
    "type",
    "typeGroup",
    "vendorField",
    "version",
];

export const walletIteratees = [
    "address",
    "stakePower",
    "power",
    "balance",
    "resigned",
    "lockedBalance",
    "nonce",
    "publicKey",
    "secondPublicKey",
    "username",
    "vote",
    "voteBalance",
];
