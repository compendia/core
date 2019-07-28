import { app } from "@arkecosystem/core-container";
import { ApplicationEvents } from "@arkecosystem/core-event-emitter";
import { Database, EventEmitter, Logger, Shared, State } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import { roundCalculator } from "@arkecosystem/core-utils";
import { Blocks, Crypto, Identities, Interfaces, Managers, Transactions, Utils } from "@arkecosystem/crypto";
import { StakeInterfaces } from "@nosplatform/stake-interfaces";
import assert from "assert";

export class DatabaseService implements Database.IDatabaseService {
    public connection: Database.IConnection;
    public walletManager: State.IWalletManager;
    public logger = app.resolvePlugin<Logger.ILogger>("logger");
    public emitter = app.resolvePlugin<EventEmitter.EventEmitter>("event-emitter");
    public config = app.getConfig();
    public options: any;
    public wallets: Database.IWalletsBusinessRepository;
    public delegates: Database.IDelegatesBusinessRepository;
    public blocksBusinessRepository: Database.IBlocksBusinessRepository;
    public transactionsBusinessRepository: Database.ITransactionsBusinessRepository;
    public blocksInCurrentRound: Interfaces.IBlock[] = undefined;
    public stateStarted: boolean = false;
    public restoredDatabaseIntegrity: boolean = false;
    public forgingDelegates: State.IDelegateWallet[] = undefined;
    public cache: Map<any, any> = new Map();

    constructor(
        options: Record<string, any>,
        connection: Database.IConnection,
        walletManager: State.IWalletManager,
        walletsBusinessRepository: Database.IWalletsBusinessRepository,
        delegatesBusinessRepository: Database.IDelegatesBusinessRepository,
        transactionsBusinessRepository: Database.ITransactionsBusinessRepository,
        blocksBusinessRepository: Database.IBlocksBusinessRepository,
    ) {
        this.connection = connection;
        this.walletManager = walletManager;
        this.options = options;
        this.wallets = walletsBusinessRepository;
        this.delegates = delegatesBusinessRepository;
        this.blocksBusinessRepository = blocksBusinessRepository;
        this.transactionsBusinessRepository = transactionsBusinessRepository;

        this.registerListeners();
    }

    public async init(): Promise<void> {
        app.resolvePlugin<State.IStateService>("state")
            .getStore()
            .setGenesisBlock(Blocks.BlockFactory.fromJson(Managers.configManager.get("genesisBlock")));

        if (process.env.CORE_RESET_DATABASE) {
            await this.reset();
        }

        await this.initializeLastBlock();

        try {
            await this.loadBlocksFromCurrentRound();
        } catch (error) {
            this.logger.warn(`Failed to load blocks from current round: ${error.message}`);
        }
    }

    public async restoreCurrentRound(height: number): Promise<void> {
        await this.initializeActiveDelegates(height);
        await this.applyRound(height);
    }

    public async reset(): Promise<void> {
        await this.connection.resetAll();
        await this.createGenesisBlock();
    }

    public async applyBlock(block: Interfaces.IBlock): Promise<void> {
        this.walletManager.applyBlock(block);

        if (this.blocksInCurrentRound) {
            this.blocksInCurrentRound.push(block);
        }

        await this.applyRound(block.data.height);

        for (const transaction of block.transactions) {
            this.emitTransactionEvents(transaction);
        }

        this.emitter.emit(ApplicationEvents.BlockApplied, block.data);
    }

    public async applyRound(height: number): Promise<void> {
        const nextHeight: number = height === 1 ? 1 : height + 1;

        if (roundCalculator.isNewRound(nextHeight)) {
            const roundInfo: Shared.IRoundInfo = roundCalculator.calculateRound(nextHeight);
            const { round } = roundInfo;

            if (
                nextHeight === 1 ||
                !this.forgingDelegates ||
                this.forgingDelegates.length === 0 ||
                this.forgingDelegates[0].round !== round
            ) {
                this.logger.info(`Starting Round ${roundInfo.round.toLocaleString()}`);

                try {
                    if (nextHeight > 1) {
                        this.updateDelegateStats(this.forgingDelegates);
                    }

                    await this.buildVoteWeights();

                    const delegates: State.IDelegateWallet[] = this.walletManager.loadActiveDelegateList(roundInfo);

                    await this.saveRound(delegates);
                    await this.setForgingDelegatesOfRound(roundInfo, delegates);

                    this.blocksInCurrentRound.length = 0;

                    this.emitter.emit(ApplicationEvents.RoundApplied);
                } catch (error) {
                    // trying to leave database state has it was
                    await this.deleteRound(round);

                    throw error;
                }
            } else {
                this.logger.warn(
                    // tslint:disable-next-line:max-line-length
                    `Round ${round.toLocaleString()} has already been applied. This should happen only if you are a forger.`,
                );
            }
        }
    }

    // Update stakes of voters and their delegates' voteBalance
    public async buildVoteWeights(): Promise<void> {
        const delegates: State.IWallet[] = this.walletManager.allByUsername().filter((w: State.IWallet) => !w.resigned);
        for (const delegate of delegates) {
            const voters = this.wallets.findAllByVote(delegate.publicKey).rows;
            for (const voter of voters) {
                for (const stakeObject of Object.values(voter.stake)) {
                    const stake: StakeInterfaces.IStakeObject = stakeObject;
                    if (Crypto.Slots.getTime() - 120 > stake.redeemableTimestamp && !stake.redeemed && !stake.halved) {
                        // First deduct previous stakeWeight from delegate voteBalance
                        delegate.voteBalance = delegate.voteBalance.minus(voter.stakeWeight);
                        // Deduct old stake object weight from voter stakeWeight
                        voter.stakeWeight = voter.stakeWeight.minus(stake.weight);
                        // Set new stake object weight
                        stake.weight = Utils.BigNumber.make(stake.weight.dividedBy(2).toFixed(0, 1));
                        // Update voter total stakeWeight
                        voter.stakeWeight = voter.stakeWeight.plus(stake.weight);
                        stake.halved = true;
                        // Update delegate voteBalance
                        delegate.voteBalance = delegate.voteBalance.plus(voter.stakeWeight);
                    }
                }
            }
        }
    }

    public async buildWallets(): Promise<void> {
        this.walletManager.reset();

        await this.connection.buildWallets();
    }

    public async deleteBlocks(blocks: Interfaces.IBlockData[]): Promise<void> {
        await this.connection.deleteBlocks(blocks);
    }

    public async deleteRound(round: number): Promise<void> {
        await this.connection.roundsRepository.delete(round);
    }

    public async getActiveDelegates(
        roundInfo: Shared.IRoundInfo,
        delegates?: State.IDelegateWallet[],
    ): Promise<State.IDelegateWallet[]> {
        const { round } = roundInfo;

        if (this.forgingDelegates && this.forgingDelegates.length && this.forgingDelegates[0].round === round) {
            return this.forgingDelegates;
        }

        // When called during applyRound we already know the delegates, so we don't have to query the database.
        if (!delegates || delegates.length === 0) {
            delegates = ((await this.connection.roundsRepository.findById(
                round,
            )) as unknown) as State.IDelegateWallet[];
        }

        const seedSource: string = round.toString();
        let currentSeed: Buffer = Crypto.HashAlgorithms.sha256(seedSource);

        for (let i = 0, delCount = delegates.length; i < delCount; i++) {
            for (let x = 0; x < 4 && i < delCount; i++, x++) {
                const newIndex = currentSeed[x] % delCount;
                const b = delegates[newIndex];
                delegates[newIndex] = delegates[i];
                delegates[i] = b;
            }
            currentSeed = Crypto.HashAlgorithms.sha256(currentSeed);
        }

        const forgingDelegates: State.IDelegateWallet[] = delegates.map(delegate => {
            delegate.round = +delegate.round;
            delegate.username = this.walletManager.findByPublicKey(delegate.publicKey).username;
            return delegate;
        });

        return forgingDelegates;
    }

    public async getBlock(id: string): Promise<Interfaces.IBlock | undefined> {
        // TODO: caching the last 1000 blocks, in combination with `saveBlock` could help to optimise
        const block: Interfaces.IBlockData = await this.connection.blocksRepository.findById(id);

        if (!block) {
            return undefined;
        }

        const transactions: Array<{
            serialized: Buffer;
            id: string;
        }> = await this.connection.transactionsRepository.findByBlockId(block.id);

        block.transactions = transactions.map(
            ({ serialized, id }) => Transactions.TransactionFactory.fromBytesUnsafe(serialized, id).data,
        );

        return Blocks.BlockFactory.fromData(block);
    }

    public async getBlocks(offset: number, limit: number, headersOnly?: boolean): Promise<Interfaces.IBlockData[]> {
        // The functions below return matches in the range [start, end], including both ends.
        const start: number = offset;
        const end: number = offset + limit - 1;

        let blocks: Interfaces.IBlockData[] = app
            .resolvePlugin<State.IStateService>("state")
            .getStore()
            .getLastBlocksByHeight(start, end, headersOnly);

        if (blocks.length !== limit) {
            blocks = (await this.connection.blocksRepository.heightRangeWithTransactions(start, end)).map(block => ({
                ...block,
                transactions:
                    headersOnly || !block.transactions
                        ? undefined
                        : block.transactions.map(
                              (transaction: string) =>
                                  Transactions.TransactionFactory.fromBytesUnsafe(Buffer.from(transaction, "hex")).data,
                          ),
            }));
        }

        return blocks;
    }

    public async getBlocksForDownload(
        offset: number,
        limit: number,
        headersOnly?: boolean,
    ): Promise<Database.IDownloadBlock[]> {
        if (headersOnly) {
            return (this.connection.blocksRepository.heightRange(offset, offset + limit - 1) as unknown) as Promise<
                Database.IDownloadBlock[]
            >;
        }

        return this.connection.blocksRepository.heightRangeWithTransactions(offset, offset + limit - 1);
    }

    /**
     * Get the blocks at the given heights.
     * The transactions for those blocks will not be loaded like in `getBlocks()`.
     * @param {Array} heights array of arbitrary block heights
     * @return {Array} array for the corresponding blocks. The element (block) at index `i`
     * in the resulting array corresponds to the requested height at index `i` in the input
     * array heights[]. For example, if
     * heights[0] = 100
     * heights[1] = 200
     * heights[2] = 150
     * then the result array will have the same number of elements (3) and will be:
     * result[0] = block at height 100
     * result[1] = block at height 200
     * result[2] = block at height 150
     * If some of the requested blocks do not exist in our chain (requested height is larger than
     * the height of our blockchain), then that element will be `undefined` in the resulting array
     * @throws Error
     */
    public async getBlocksByHeight(heights: number[]) {
        const blocks = [];

        // Map of height -> index in heights[], e.g. if
        // heights[5] == 6000000, then
        // toGetFromDB[6000000] == 5
        // In this map we only store a subset of the heights - the ones we could not retrieve
        // from app/state and need to get from the database.
        const toGetFromDB = {};

        for (const [i, height] of heights.entries()) {
            const stateBlocks = app
                .resolvePlugin<State.IStateService>("state")
                .getStore()
                .getLastBlocksByHeight(height, height, true);

            if (Array.isArray(stateBlocks) && stateBlocks.length > 0) {
                blocks[i] = stateBlocks[0];
            }

            if (blocks[i] === undefined) {
                toGetFromDB[height] = i;
            }
        }

        const heightsToGetFromDB: number[] = Object.keys(toGetFromDB).map(height => +height);
        if (heightsToGetFromDB.length > 0) {
            const blocksByHeights = await this.connection.blocksRepository.findByHeights(heightsToGetFromDB);

            for (const blockFromDB of blocksByHeights) {
                const index = toGetFromDB[blockFromDB.height];
                blocks[index] = blockFromDB;
            }
        }

        return blocks;
    }

    public async getBlocksForRound(roundInfo?: Shared.IRoundInfo): Promise<Interfaces.IBlock[]> {
        let lastBlock: Interfaces.IBlock = app
            .resolvePlugin<State.IStateService>("state")
            .getStore()
            .getLastBlock();

        if (!lastBlock) {
            lastBlock = await this.getLastBlock();
        }

        if (!lastBlock) {
            return [];
        }

        if (!roundInfo) {
            roundInfo = roundCalculator.calculateRound(lastBlock.data.height);
        }

        return (await this.getBlocks(roundInfo.roundHeight, roundInfo.maxDelegates)).map((b: Interfaces.IBlockData) =>
            Blocks.BlockFactory.fromData(b),
        );
    }

    public async getForgedTransactionsIds(ids: string[]): Promise<string[]> {
        if (!ids.length) {
            return [];
        }

        return (await this.connection.transactionsRepository.forged(ids)).map(
            (transaction: Interfaces.ITransactionData) => transaction.id,
        );
    }

    public async getLastBlock(): Promise<Interfaces.IBlock> {
        const block: Interfaces.IBlockData = await this.connection.blocksRepository.latest();

        if (!block) {
            return undefined;
        }

        const transactions: Array<{
            serialized: Buffer;
            id: string;
        }> = await this.connection.transactionsRepository.latestByBlock(block.id);

        block.transactions = transactions.map(
            ({ serialized, id }) => Transactions.TransactionFactory.fromBytesUnsafe(serialized, id).data,
        );

        return Blocks.BlockFactory.fromData(block);
    }

    public async getCommonBlocks(ids: string[]): Promise<Interfaces.IBlockData[]> {
        let commonBlocks: Interfaces.IBlockData[] = app
            .resolvePlugin<State.IStateService>("state")
            .getStore()
            .getCommonBlocks(ids);

        if (commonBlocks.length < ids.length) {
            commonBlocks = await this.connection.blocksRepository.common(ids);
        }

        return commonBlocks;
    }

    public async getRecentBlockIds(): Promise<string[]> {
        let blocks: Interfaces.IBlockData[] = app
            .resolvePlugin("state")
            .getStore()
            .getLastBlockIds()
            .reverse()
            .slice(0, 10);

        if (blocks.length < 10) {
            blocks = await this.connection.blocksRepository.recent(10);
        }

        return blocks.map(block => block.id);
    }

    public async getTopBlocks(count: number): Promise<Interfaces.IBlockData[]> {
        const blocks: Interfaces.IBlockData[] = await this.connection.blocksRepository.top(count);

        await this.loadTransactionsForBlocks(blocks);

        return blocks;
    }

    public async getTransaction(id: string) {
        return this.connection.transactionsRepository.findById(id);
    }

    public async loadBlocksFromCurrentRound(): Promise<void> {
        this.blocksInCurrentRound = await this.getBlocksForRound();
    }

    public async revertBlock(block: Interfaces.IBlock): Promise<void> {
        await this.revertRound(block.data.height);
        this.walletManager.revertBlock(block);

        assert(this.blocksInCurrentRound.pop().data.id === block.data.id);

        this.emitter.emit(ApplicationEvents.BlockReverted, block.data);
    }

    public async revertRound(height: number): Promise<void> {
        const roundInfo: Shared.IRoundInfo = roundCalculator.calculateRound(height);
        const { round, nextRound, maxDelegates } = roundInfo;

        if (nextRound === round + 1 && height >= maxDelegates) {
            this.logger.info(`Back to previous round: ${round.toLocaleString()}`);

            this.blocksInCurrentRound = await this.getBlocksForRound(roundInfo);

            await this.setForgingDelegatesOfRound(
                roundInfo,
                await this.calcPreviousActiveDelegates(roundInfo, this.blocksInCurrentRound),
            );

            await this.deleteRound(nextRound);
        }
    }

    public async saveBlock(block: Interfaces.IBlock): Promise<void> {
        await this.connection.saveBlock(block);
    }

    public async saveBlocks(blocks: Interfaces.IBlock[]): Promise<void> {
        await this.connection.saveBlocks(blocks);
    }

    public async saveRound(activeDelegates: State.IDelegateWallet[]): Promise<void> {
        this.logger.info(`Saving round ${activeDelegates[0].round.toLocaleString()}`);

        await this.connection.roundsRepository.insert(activeDelegates);

        this.emitter.emit(ApplicationEvents.RoundCreated, activeDelegates);
    }

    public updateDelegateStats(delegates: State.IDelegateWallet[]): void {
        if (!delegates || !this.blocksInCurrentRound) {
            return;
        }

        if (this.blocksInCurrentRound.length === 1 && this.blocksInCurrentRound[0].data.height === 1) {
            return;
        }

        this.logger.debug("Updating delegate statistics");

        try {
            for (const delegate of delegates) {
                const producedBlocks: Interfaces.IBlock[] = this.blocksInCurrentRound.filter(
                    blockGenerator => blockGenerator.data.generatorPublicKey === delegate.publicKey,
                );

                if (producedBlocks.length === 0) {
                    const wallet: State.IWallet = this.walletManager.findByPublicKey(delegate.publicKey);

                    this.logger.debug(`Delegate ${wallet.username} (${wallet.publicKey}) just missed a block.`);

                    this.emitter.emit(ApplicationEvents.ForgerMissing, {
                        delegate: wallet,
                    });
                }
            }
        } catch (error) {
            this.logger.error(error.stack);
        }
    }

    public async verifyBlockchain(): Promise<boolean> {
        const errors: string[] = [];

        const lastBlock: Interfaces.IBlock = await this.getLastBlock();

        // Last block is available
        if (!lastBlock) {
            errors.push("Last block is not available");
        } else {
            const numberOfBlocks: number = await this.connection.blocksRepository.count();

            // Last block height equals the number of stored blocks
            if (lastBlock.data.height !== +numberOfBlocks) {
                errors.push(
                    `Last block height: ${lastBlock.data.height.toLocaleString()}, number of stored blocks: ${numberOfBlocks}`,
                );
            }
        }

        const blockStats: {
            numberOfTransactions: number;
            totalFee: Utils.BigNumber;
            totalAmount: Utils.BigNumber;
            count: number;
        } = await this.connection.blocksRepository.statistics();

        const transactionStats: {
            count: number;
            totalFee: Utils.BigNumber;
            totalAmount: Utils.BigNumber;
        } = await this.connection.transactionsRepository.statistics();

        // Number of stored transactions equals the sum of block.numberOfTransactions in the database
        if (blockStats.numberOfTransactions !== transactionStats.count) {
            errors.push(
                `Number of transactions: ${transactionStats.count}, number of transactions included in blocks: ${blockStats.numberOfTransactions}`,
            );
        }

        // Sum of all tx fees equals the sum of block.totalFee
        const transactionFeeToReward = Utils.FeeHelper.getFeeObject(Utils.BigNumber.make(transactionStats.totalFee))
            .toReward;
        if (!Utils.BigNumber.make(blockStats.totalFee).isEqualTo(transactionFeeToReward)) {
            errors.push(
                `Total transaction fees: ${transactionStats.totalFee}, total of block.totalFee : ${blockStats.totalFee}`,
            );
        }

        // Sum of all tx amount equals the sum of block.totalAmount
        if (!Utils.BigNumber.make(blockStats.totalAmount).isEqualTo(transactionStats.totalAmount)) {
            errors.push(
                `Total transaction amounts: ${transactionStats.totalAmount}, total of block.totalAmount : ${blockStats.totalAmount}`,
            );
        }

        const hasErrors: boolean = errors.length > 0;

        if (hasErrors) {
            this.logger.error("FATAL: The database is corrupted");
            this.logger.error(JSON.stringify(errors, undefined, 4));
        }

        return !hasErrors;
    }

    public async verifyTransaction(transaction: Interfaces.ITransaction): Promise<boolean> {
        const senderId: string = Identities.Address.fromPublicKey(transaction.data.senderPublicKey);

        const sender: State.IWallet = this.walletManager.findByAddress(senderId);
        const transactionHandler: Handlers.TransactionHandler = Handlers.Registry.get(transaction.type);

        if (!sender.publicKey) {
            sender.publicKey = transaction.data.senderPublicKey;

            this.walletManager.reindex(sender);
        }

        const dbTransaction = await this.getTransaction(transaction.data.id);

        try {
            return transactionHandler.canBeApplied(transaction, sender, this.walletManager) && !dbTransaction;
        } catch {
            return false;
        }
    }

    private async initializeLastBlock(): Promise<void> {
        let lastBlock: Interfaces.IBlock;
        let tries = 5;

        const getLastBlock = async (): Promise<Interfaces.IBlock> => {
            try {
                return await this.getLastBlock();
            } catch (error) {
                this.logger.error(error.message);

                if (tries > 0) {
                    const block: Interfaces.IBlockData = await this.connection.blocksRepository.latest();
                    await this.deleteBlocks([block]);
                    tries--;
                } else {
                    app.forceExit("Unable to deserialize last block from database.", error);
                    return undefined;
                }

                return getLastBlock();
            }
        };

        lastBlock = await getLastBlock();

        if (!lastBlock) {
            this.logger.warn("No block found in database");

            lastBlock = await this.createGenesisBlock();
        }

        this.configureState(lastBlock);
    }

    private async loadTransactionsForBlocks(blocks: Interfaces.IBlockData[]): Promise<void> {
        const dbTransactions: Array<{
            id: string;
            blockId: string;
            serialized: Buffer;
        }> = await this.getTransactionsForBlocks(blocks);

        const transactions = dbTransactions.map(tx => {
            const { data } = Transactions.TransactionFactory.fromBytesUnsafe(tx.serialized, tx.id);
            data.blockId = tx.blockId;
            return data;
        });

        for (const block of blocks) {
            if (block.numberOfTransactions > 0) {
                block.transactions = transactions.filter(transaction => transaction.blockId === block.id);
            }
        }
    }

    private async getTransactionsForBlocks(
        blocks: Interfaces.IBlockData[],
    ): Promise<
        Array<{
            id: string;
            blockId: string;
            serialized: Buffer;
        }>
    > {
        if (!blocks.length) {
            return [];
        }

        const ids: string[] = blocks.map((block: Interfaces.IBlockData) => block.id);
        return this.connection.transactionsRepository.latestByBlocks(ids);
    }

    private async createGenesisBlock(): Promise<Interfaces.IBlock> {
        const genesisBlock: Interfaces.IBlock = app
            .resolvePlugin<State.IStateService>("state")
            .getStore()
            .getGenesisBlock();

        await this.saveBlock(genesisBlock);

        return genesisBlock;
    }

    private configureState(lastBlock: Interfaces.IBlock): void {
        const state: State.IStateService = app.resolvePlugin<State.IStateService>("state");

        state.getStore().setLastBlock(lastBlock);

        const { blocktime, block } = Managers.configManager.getMilestone();

        const blocksPerDay: number = Math.ceil(86400 / blocktime);
        state.getBlocks().resize(blocksPerDay);
        state.getTransactions().resize(blocksPerDay * block.maxTransactions);
    }

    private async initializeActiveDelegates(height: number): Promise<void> {
        this.forgingDelegates = undefined;

        const roundInfo: Shared.IRoundInfo = roundCalculator.calculateRound(height);

        await this.setForgingDelegatesOfRound(roundInfo, await this.calcPreviousActiveDelegates(roundInfo));
    }

    private async setForgingDelegatesOfRound(
        roundInfo: Shared.IRoundInfo,
        delegates?: State.IDelegateWallet[],
    ): Promise<void> {
        this.forgingDelegates = await this.getActiveDelegates(roundInfo, delegates);
    }

    private async calcPreviousActiveDelegates(
        roundInfo: Shared.IRoundInfo,
        blocks?: Interfaces.IBlock[],
    ): Promise<State.IDelegateWallet[]> {
        blocks = blocks || (await this.getBlocksForRound(roundInfo));

        const tempWalletManager = this.walletManager.clone();

        // Revert all blocks in reverse order
        const index: number = blocks.length - 1;

        let height: number = 0;
        for (let i = index; i >= 0; i--) {
            height = blocks[i].data.height;

            if (height === 1) {
                break;
            }

            tempWalletManager.revertBlock(blocks[i]);
        }

        // Now retrieve the active delegate list from the temporary wallet manager.
        const delegates: State.IDelegateWallet[] = tempWalletManager.loadActiveDelegateList(roundInfo);

        for (const delegate of tempWalletManager.allByUsername()) {
            this.walletManager.findByUsername(delegate.username).rate = delegate.rate;
        }

        return delegates;
    }

    private emitTransactionEvents(transaction: Interfaces.ITransaction): void {
        this.emitter.emit(ApplicationEvents.TransactionApplied, transaction.data);

        Handlers.Registry.get(transaction.type).emitEvents(transaction, this.emitter);
    }

    private registerListeners(): void {
        this.emitter.on(ApplicationEvents.StateStarted, () => {
            this.stateStarted = true;
        });

        this.emitter.on(ApplicationEvents.WalletColdCreated, async coldWallet => {
            try {
                const wallet = await this.connection.walletsRepository.findByAddress(coldWallet.address);

                if (wallet) {
                    for (const key of Object.keys(wallet)) {
                        if (["balance"].indexOf(key) !== -1) {
                            return;
                        }

                        coldWallet[key] = key !== "voteBalance" ? wallet[key] : Utils.BigNumber.make(wallet[key]);
                    }
                }
            } catch (err) {
                this.logger.error(err);
            }
        });
    }
}
