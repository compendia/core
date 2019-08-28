import { app } from "@arkecosystem/core-container";
import { Utils } from "@arkecosystem/crypto";
import Hapi from "@hapi/hapi";
import { Controller } from "../shared/controller";

export class BlockchainController extends Controller {
    public async index(request: Hapi.Request, h: Hapi.ResponseToolkit) {
        const lastBlock = this.blockchain.getLastBlock();
        const supply: number = app.resolve("supply").toNumber();

        let staked: number = Utils.BigNumber.ZERO.toNumber();
        if (app.has("stake.total")) {
            staked = app.resolve("stake.total").toNumber();
        }

        return {
            data: {
                block: {
                    height: lastBlock.data.height,
                    id: lastBlock.data.id,
                },
                supply,
                staked,
            },
        };
    }
}
