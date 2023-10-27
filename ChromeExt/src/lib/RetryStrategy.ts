
export interface RetryStrategy
{
    getNoTriesLeft(): boolean
    getTryNow(timestampMs: number): boolean
}

export interface RetryStrategyMaker
{
    makeRetryStrategy(): RetryStrategy
}

export class RetryStrategyFactorGrowth implements RetryStrategy
{

    private nextTryTimestamp: number = 0
    private nextDelayMs: number
    private readonly delayGrowthFactor: number
    private readonly retryDelayMaxMs: number

    public constructor(firstRetryDelayMs: number, delayGrowthFactor: number, retryDelayMaxMs: number)
    {
        this.nextDelayMs = firstRetryDelayMs
        this.delayGrowthFactor = delayGrowthFactor
        this.retryDelayMaxMs = retryDelayMaxMs
    }

    public getNoTriesLeft(): boolean
    {
        return false;
    }

    public getTryNow(timestampMs: number): boolean
    {
        if (this.nextTryTimestamp > timestampMs) {
            return false
        }
        this.nextTryTimestamp = timestampMs + this.nextDelayMs
        this.nextDelayMs = Math.min(this.retryDelayMaxMs, this.delayGrowthFactor * this.nextDelayMs)
        return true
    }

}

export class RetryStrategyFactorGrowthMaker implements RetryStrategyMaker
{

    private readonly firstRetryDelayMs: number
    private readonly delayGrowthFactor: number
    private readonly retryDelayMaxMs: number

    public constructor(firstRetryDelaySecs: number, delayGrowthFactor: number, retryDelayMaxSecs: number)
    {
        this.firstRetryDelayMs = 1e3 * firstRetryDelaySecs
        this.delayGrowthFactor = delayGrowthFactor
        this.retryDelayMaxMs = 1e3 * retryDelayMaxSecs
    }

    public makeRetryStrategy(): RetryStrategyFactorGrowth
    {
        return new RetryStrategyFactorGrowth(this.firstRetryDelayMs, this.delayGrowthFactor, this.retryDelayMaxMs)
    }

}
