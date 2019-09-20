import Hapi from "@hapi/hapi";
import { Utils } from "@nosplatform/crypto";
import { Statistic } from "@nosplatform/storage";
import { Controller } from "../shared/controller";

export class BlockchainController extends Controller {
    public async index(request: Hapi.Request, h: Hapi.ResponseToolkit) {
        const lastBlock = this.blockchain.getLastBlock();

        const supplyModel = await Statistic.findOne({ name: "supply" });
        const supply = Utils.BigNumber.make(supplyModel.value).toNumber();

        const stakeModel = await Statistic.findOne({ name: "staked" });
        const staked = Utils.BigNumber.make(stakeModel.value).toNumber();

        const removedFeesModel = await Statistic.findOne({ name: "removed" });
        const removed = Utils.BigNumber.make(removedFeesModel.value).toNumber();

        return {
            data: {
                block: {
                    height: lastBlock.data.height,
                    id: lastBlock.data.id,
                },
                supply,
                staked,
                removed,
            },
        };
    }
}
