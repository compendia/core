import { app } from "@arkecosystem/core-container";
import { State } from "@arkecosystem/core-interfaces";
import { Managers, Transactions } from "@arkecosystem/crypto";
import { StakeInterfaces } from "@nos/stake-interfaces";
import ByteBuffer from "bytebuffer";
import { IStakeCreateAsset } from "../interfaces";

const { schemas } = Transactions;

const STAKE_TYPE = 100;

export class StakeCreateTransaction extends Transactions.Transaction {
    public static type = STAKE_TYPE;

    public static getSchema(): Transactions.schemas.TransactionSchema {
        const configManager = Managers.configManager;
        const lastBlock = app
            .resolvePlugin<State.IStateService>("state")
            .getStore()
            .getLastBlock();
        const milestone = configManager.getMilestone(lastBlock.data.height);

        return schemas.extend(schemas.transactionBaseSchema, {
            $id: "stakeCreate",
            required: ["asset"],
            properties: {
                type: { transactionType: STAKE_TYPE },
                amount: { bignumber: { minimum: milestone.minimumStake } },
                asset: {
                    type: "object",
                    required: ["stakeCreate"],
                    properties: {
                        stakeCreate: {
                            type: "object",
                            required: ["duration"],
                            properties: {
                                duration: {
                                    type: "integer",
                                    // Minimum duration of 3 months
                                    // TODO: Don't hardcode this value. Use milestone config.
                                    minimum: 7889400,
                                },
                            },
                        },
                    },
                },
            },
        });
    }

    public serialize(): ByteBuffer {
        const { data } = this;
        const stakeCreate = data.asset.stakeCreate as StakeInterfaces.IStakeObject;

        // TODO: Verify that this works
        const buffer = new ByteBuffer(24, true);
        buffer.writeUint64(+stakeCreate.duration);
        return buffer;
    }

    public deserialize(buf: ByteBuffer): void {
        const { data } = this;
        const stakeCreate = {} as IStakeCreateAsset;

        stakeCreate.duration = buf.readUint64().toInt();

        data.asset = {
            stakeCreate,
        };
    }
}
