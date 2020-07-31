import { State } from "@arkecosystem/core-interfaces";
import { Interfaces } from "@arkecosystem/crypto";
import { createHandyClient } from "handy-redis";

const redis = createHandyClient();

export class SetFileHelper {
    public static getKey(fullKey: string) {
        return fullKey.substr(fullKey.indexOf(".") + 1, fullKey.length);
    }

    public static isSchemaTransaction(key: string): boolean {
        return key.startsWith("schema.");
    }

    public static async schemaExists(schema: string, walletManager: State.IWalletManager): Promise<boolean> {
        const key = `${walletManager.constructor.name}:schema:${schema}`;
        const exists = await redis.exists(key);
        return exists === 1;
    }

    public static async storeSchema(
        transaction: any,
        schema: string,
        wallet: State.IWallet,
        walletManager: State.IWalletManager,
    ): Promise<void> {
        const key = `${walletManager.constructor.name}:schema:${schema}`;
        console.log(`Storing ${key}`);
        const exists = await redis.exists(key);
        if (!exists) {
            await redis.hmset(key, ["transaction", transaction.id], ["address", wallet.address]);
        }
    }

    public static async removeSchema(schema: string, walletManager: State.IWalletManager): Promise<void> {
        const key = `${walletManager.constructor.name}:schema:${schema}`;
        await redis.del(key);
    }
}
