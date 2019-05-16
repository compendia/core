import { app } from "@arkecosystem/core-container/dist";
import { State } from "@arkecosystem/core-interfaces/dist";
import { Transactions, Utils } from "@arkecosystem/crypto/dist";
import { configManager } from "@arkecosystem/crypto/dist/managers";
import ByteBuffer from "bytebuffer";
import { IStakeRegistrationAsset } from "../interfaces";

const { schemas } = Transactions;

const STAKE_TYPE = 100;

export class StakeRegistrationTransaction extends Transactions.Transaction {
    public static type = STAKE_TYPE;

    public static getSchema(): Transactions.schemas.TransactionSchema {
        const lastBlock = app
            .resolvePlugin<State.IStateService>("state")
            .getStore()
            .getLastBlock();
        const milestone = configManager.getMilestone(lastBlock.data.height);

        return schemas.extend(schemas.transactionBaseSchema, {
            $id: "stakeRegistration",
            required: ["asset"],
            properties: {
                type: { transactionType: STAKE_TYPE },
                // TODO: Get minimum stake from config (milestones)
                amount: { bignumber: { minimum: milestone.minimumStake } },
                asset: {
                    type: "object",
                    required: ["stakeRegistration"],
                    properties: {
                        stakeRegistration: {
                            type: "object",
                            required: ["duration"],
                            properties: {
                                name: {
                                    type: "integer",
                                    // Minimum duration of 3 months
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
        const stakeRegistration = data.asset.stakeRegistration as IStakeRegistrationAsset;

        // TODO: Verify that this works
        const buffer = new ByteBuffer(24, true);
        buffer.writeUint64(+stakeRegistration.duration);
        return buffer;
    }

    public deserialize(buf: ByteBuffer): void {
        const { data } = this;
        const stakeRegistration = {} as IStakeRegistrationAsset;

        data.asset.duration = Utils.BigNumber.make(buf.readUint64().toInt());

        data.asset = {
            stakeRegistration,
        };
    }
}
