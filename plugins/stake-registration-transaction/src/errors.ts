// tslint:disable:max-classes-per-file
import { Errors } from "@arkecosystem/core-transactions";

export class StakeAssetError extends Errors.TransactionError {
    constructor() {
        super(`Invalid stake asset.`);
    }
}
