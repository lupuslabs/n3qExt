import { is } from './is';
import { as } from './as';
import { ErrorWithData } from './Utils';
import { ItemProperties } from './ItemProperties';

export class ItemUpdateSubscription {
    readonly ownItems: boolean
    readonly otherItems: boolean
    readonly matchProperties: ReadonlyArray<[string, null|string]>
    readonly pidsToSend: ReadonlyArray<string>

    static fromObject(subscriptionData: unknown): null|ItemUpdateSubscription {
        if (!is.object(subscriptionData) || is.array(subscriptionData)) {
            throw new ErrorWithData('data isn\'t parsable as ItemUpdateSubscription!', {subscriptionData})
        }
        const ownItems = subscriptionData['ownItems'] ?? false
        const otherItems = subscriptionData['otherItems'] ?? false
        if (!is.boolean(ownItems)) {
            throw new ErrorWithData('ownItems not a boolean for ItemUpdateSubscription!', {subscriptionData})
        }
        if (!is.boolean(otherItems)) {
            throw new ErrorWithData('otherItems not a boolean for ItemUpdateSubscription!', {subscriptionData})
        }
        if (!ownItems && !otherItems) {
            return null // Can't match anything.
        }

        const matchProperties: [string, null|string][] = []
        const rawMatchProperties = subscriptionData['matchProperties'] ?? []
        if (!is.array(rawMatchProperties)) {
            throw new ErrorWithData('matchProperties not parsable for ItemUpdateSubscription!', {subscriptionData})
        }
        for (const entry of rawMatchProperties) {
            if (!is.array(entry) || !is.nonEmptyString(entry[0]) || !(is.nil(entry[1]) || is.string(entry[1]))) {
                throw new ErrorWithData('matchProperties entry not parsable for ItemUpdateSubscription!', {subscriptionData, entry})
            }
            matchProperties.push([entry[0], entry[1] ?? null])
        }

        const pidsToSend = subscriptionData['pidsToSend'] ?? []
        if (!is.array(pidsToSend, is.nonEmptyString)) {
            throw new ErrorWithData('pidsToSend not parsable for ItemUpdateSubscription!', {subscriptionData})
        }

        return new ItemUpdateSubscription(ownItems, otherItems, matchProperties, pidsToSend)
    }

    static getPropertiesToSendBySubscriptions(itemUpdateSubscriptions: Iterable<ItemUpdateSubscription>, item: Readonly<ItemProperties>, isOwnItem: boolean): null|Readonly<ItemProperties> {
        let itemMatches = false
        const pidsToSend = []
        for (const subscription of itemUpdateSubscriptions) {
            if (subscription.isMatchingItem(item, isOwnItem)) {
                itemMatches = true
                if (subscription.pidsToSend.length === 0) {
                    return item
                }
                pidsToSend.push(...subscription.pidsToSend)
            }
        }
        if (!itemMatches) {
            return null
        }
        return ItemProperties.getStrings(item, pidsToSend)
    }

    public constructor(ownItems: boolean, otherItems: boolean, matchProperties: ReadonlyArray<[string, null|string]>, pidsToSend: ReadonlyArray<string>) {
        this.ownItems = ownItems
        this.otherItems = otherItems
        this.matchProperties = matchProperties
        this.pidsToSend = pidsToSend
    }

    public isMatchingItem(item: Readonly<ItemProperties>, isOwnItem: boolean): boolean {
        if ((isOwnItem && !this.ownItems) || (!isOwnItem && !this.otherItems)) {
            return false
        }
        for (const [pid, value] of this.matchProperties) {
            if (is.nil(value)) {
                if (!as.Bool(item[pid])) {
                    return false
                }
            } else {
                if (item[pid] !== value) {
                    return false
                }
            }
        }
        return true
    }

    public getPidsToSend(item: Readonly<ItemProperties>): ReadonlyArray<string> {
        if (this.pidsToSend.length === 0) {
            return Object.keys(item)
        }
        return this.pidsToSend
    }

}
