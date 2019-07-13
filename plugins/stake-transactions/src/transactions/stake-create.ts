import { Managers, Transactions, Utils } from "@arkecosystem/crypto";
import ByteBuffer from "bytebuffer";
import { IStakeCreateAsset } from "../interfaces";

const { schemas } = Transactions;

const STAKE_TYPE = 100;

export class StakeCreateTransaction extends Transactions.Transaction {
    public static type = STAKE_TYPE;

    public static getSchema(): Transactions.schemas.TransactionSchema {
        const configManager = Managers.configManager;
        const milestone = configManager.getMilestone();

        return schemas.extend(schemas.transactionBaseSchema, {
            $id: "stakeCreate",
            required: ["asset"],
            properties: {
                type: { transactionType: STAKE_TYPE },
                amount: { bignumber: { minimum: 0, maximum: 0 } },
                asset: {
                    type: "object",
                    required: ["stakeCreate"],
                    properties: {
                        stakeCreate: {
                            type: "object",
                            required: ["duration", "amount", "timestamp"],
                            properties: {
                                duration: {
                                    type: "integer",
                                    // Minimum duration of 3 months
                                    // TODO: Don't hardcode this value. Use env.
                                    minimum: 7889400,
                                },
                                amount: {
                                    bignumber: {
                                        minimum: milestone.minimumStake,
                                    },
                                },
                                timestamp: {
                                    type: "integer",
                                },
                            },
                        },
                    },
                },
            },
        });
    }

    public serialize(): ByteBuffer {
        // @ts-ignore
        const { data } = this;
        const stakeCreate = data.asset.stakeCreate as IStakeCreateAsset;

        // TODO: Verify that this works
        const buffer = new ByteBuffer(24, true);
        buffer.writeUint64(+stakeCreate.duration);
        buffer.writeUint64(+stakeCreate.amount);
        buffer.writeUint64(+stakeCreate.timestamp);
        return buffer;
    }

    public deserialize(buf: ByteBuffer): void {
        // @ts-ignore
        const { data } = this;
        const stakeCreate = {} as IStakeCreateAsset;

        stakeCreate.duration = buf.readUint64().toInt();
        stakeCreate.amount = Utils.BigNumber.make(buf.readUint64().toString());
        stakeCreate.timestamp = buf.readUint64().toInt();

        data.asset = {
            stakeCreate,
        };
    }
}
