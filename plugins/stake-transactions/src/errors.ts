// tslint:disable:max-classes-per-file
import { Errors } from "@arkecosystem/core-transactions";

export class StakeAssetError extends Errors.TransactionError {
    constructor() {
        super(`Invalid stake asset.`);
    }
}

export class NotEnoughBalanceError extends Errors.TransactionError {
    constructor() {
        super(`Not enough balance.`);
    }
}

export class StakeNotIntegerError extends Errors.TransactionError {
    constructor() {
        super(`Stake amount is not a whole number.`);
    }
}

export class StakeAlreadyCanceledError extends Errors.TransactionError {
    constructor() {
        super(`Stake already canceled.`);
    }
}

export class StakeNotFoundError extends Errors.TransactionError {
    constructor() {
        super(`Specified stake not found for wallet.`);
    }
}

export class WalletHasNoStakeError extends Errors.TransactionError {
    constructor() {
        super(`Wallet has no stake.`);
    }
}

export class StakeAlreadyRedeemedError extends Errors.TransactionError {
    constructor() {
        super(`Stake has already been redeemed.`);
    }
}

export class StakeNotYetRedeemableError extends Errors.TransactionError {
    constructor() {
        super(`Stake not yet redeemable.`);
    }
}

export class StakeDurationError extends Errors.TransactionError {
    constructor() {
        super(`Incorrect stake duration.`);
    }
}

export class StakeNotYetCanceledError extends Errors.TransactionError {
    constructor() {
        super(`Stake not yet canceled.`);
    }
}

export class StakeAlreadyExpiredError extends Errors.TransactionError {
    constructor() {
        super(`Stake is already expired.`);
    }
}
