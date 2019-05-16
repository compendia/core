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
                amount: { bignumber: { minimum: milestone.minimumStake } },
                asset: {
                    type: "object",
                    required: ["stakeRegistration"],
                    properties: {
                        stakeRegistration: {
                            type: "object",
                            required: ["duration"],
                            properties: {
                                duration: {
                                    type: "integer",
                                    // Minimum duration of 3 months
                                    // TODO: Don't hardcode this value
                                    minimum: 7889400,
                                },
                                cancel: { anyOf: [{ type: "null" }, { type: "integer" }] },
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
        buffer.writeUint64(stakeRegistration.cancel || 0);
        return buffer;
    }

    public deserialize(buf: ByteBuffer): void {
        const { data } = this;
        const stakeRegistration = {} as IStakeRegistrationAsset;

        stakeRegistration.duration = buf.readUint64().toInt();
        stakeRegistration.cancel = buf.readUint64().toInt();

        data.asset = {
            stakeRegistration,
        };
    }
}
