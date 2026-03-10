import { expect } from 'chai';
import { ItemUpdateSubscription } from '../lib/ItemUpdateSubscription';

export class TestItemUpdateSubscription {

    // fromObject

    fromObject_returns_null_when_both_ownItems_and_otherItems_are_false() {
        const result1 = ItemUpdateSubscription.fromObject({})
        expect(result1).to.equal(null)

        const result2 = ItemUpdateSubscription.fromObject({ ownItems: false })
        expect(result2).to.equal(null)

        const result3 = ItemUpdateSubscription.fromObject({ otherItems: false })
        expect(result3).to.equal(null)

        const result4 = ItemUpdateSubscription.fromObject({
            ownItems: false,
            otherItems: false,
            matchProperties: [['foo', 'bar']],
            pidsToSend: ['baz']
        })
        expect(result4).to.equal(null)
    }

    fromObject_throws_when_data_is_not_an_object() {
        expect(() => ItemUpdateSubscription.fromObject([])).to.throw()
        expect(() => ItemUpdateSubscription.fromObject('string')).to.throw()
        expect(() => ItemUpdateSubscription.fromObject(42)).to.throw()
        expect(() => ItemUpdateSubscription.fromObject(null)).to.throw()
        expect(() => ItemUpdateSubscription.fromObject(undefined)).to.throw()
    }

    fromObject_throws_for_non_boolean_ownItems_or_otherItems() {
        expect(() => ItemUpdateSubscription.fromObject({ ownItems: 'true' })).to.throw()
        expect(() => ItemUpdateSubscription.fromObject({ ownItems: 1 })).to.throw()
        expect(() => ItemUpdateSubscription.fromObject({ otherItems: 'true' })).to.throw()
        expect(() => ItemUpdateSubscription.fromObject({ otherItems: 1 })).to.throw()
    }

    fromObject_returns_subscription_with_ownItems_true() {
        const result = ItemUpdateSubscription.fromObject({ ownItems: true })
        expect(result).to.not.equal(null)
        expect(result.ownItems).to.equal(true)
        expect(result.otherItems).to.equal(false)
        expect(result.matchProperties).to.deep.equal([])
        expect(result.pidsToSend).to.deep.equal([])
    }

    fromObject_returns_subscription_with_otherItems_true() {
        const result = ItemUpdateSubscription.fromObject({ otherItems: true })
        expect(result).to.not.equal(null)
        expect(result.ownItems).to.equal(false)
        expect(result.otherItems).to.equal(true)
        expect(result.matchProperties).to.deep.equal([])
        expect(result.pidsToSend).to.deep.equal([])
    }

    fromObject_throws_for_invalid_matchProperties() {
        expect(() => ItemUpdateSubscription.fromObject({ ownItems: true, matchProperties: 'foo' })).to.throw()
        expect(() => ItemUpdateSubscription.fromObject({ ownItems: true, matchProperties: {} })).to.throw()
        expect(() => ItemUpdateSubscription.fromObject({ ownItems: true, matchProperties: [42] })).to.throw()
        expect(() => ItemUpdateSubscription.fromObject({ ownItems: true, matchProperties: [[]] })).to.throw()
        expect(() => ItemUpdateSubscription.fromObject({ ownItems: true, matchProperties: [[[]]] })).to.throw()
        expect(() => ItemUpdateSubscription.fromObject({ ownItems: true, matchProperties: [[[], null]] })).to.throw()
        expect(() => ItemUpdateSubscription.fromObject({ ownItems: true, matchProperties: [[[], 'value']] })).to.throw()
        expect(() => ItemUpdateSubscription.fromObject({ ownItems: true, matchProperties: [['', 'value']] })).to.throw()
        expect(() => ItemUpdateSubscription.fromObject({ ownItems: true, matchProperties: [[123, 'value']] })).to.throw()
        expect(() => ItemUpdateSubscription.fromObject({ ownItems: true, matchProperties: [['Pid', 42]] })).to.throw()
        expect(() => ItemUpdateSubscription.fromObject({ ownItems: true, matchProperties: [['Pid', []]] })).to.throw()
    }

    fromObject_parses_matchProperties() {
        const result = ItemUpdateSubscription.fromObject({
            ownItems: true,
            matchProperties: [['Template', 'Dice'], ['IsRezzed', null]],
        })
        expect(result.ownItems).to.equal(true)
        expect(result.otherItems).to.equal(false)
        expect(result.matchProperties).to.deep.equal([['Template', 'Dice'], ['IsRezzed', null]])
        expect(result.pidsToSend).to.deep.equal([])
    }

    fromObject_throws_for_invalid_pidsToSend() {
        expect(() => ItemUpdateSubscription.fromObject({ ownItems: true, pidsToSend: 'Id' })).to.throw()
        expect(() => ItemUpdateSubscription.fromObject({ ownItems: true, pidsToSend: {} })).to.throw()
        expect(() => ItemUpdateSubscription.fromObject({ ownItems: true, pidsToSend: [42] })).to.throw()
        expect(() => ItemUpdateSubscription.fromObject({ ownItems: true, pidsToSend: [''] })).to.throw()
        expect(() => ItemUpdateSubscription.fromObject({ ownItems: true, pidsToSend: [[]] })).to.throw()
        expect(() => ItemUpdateSubscription.fromObject({ ownItems: true, pidsToSend: [{}] })).to.throw()
    }

    fromObject_parses_pidsToSend() {
        const result = ItemUpdateSubscription.fromObject({
            ownItems: true,
            pidsToSend: ['Id', 'Template'],
        })
        expect(result.ownItems).to.equal(true)
        expect(result.otherItems).to.equal(false)
        expect(result.matchProperties).to.deep.equal([])
        expect(result.pidsToSend).to.deep.equal(['Id', 'Template'])
    }

    fromObject_parses_everything() {
        const result = ItemUpdateSubscription.fromObject({
            ownItems: true,
            otherItems: true,
            matchProperties: [['Template', 'Dice'], ['IsRezzed', null]],
            pidsToSend: ['Id', 'Template'],
        })
        expect(result.ownItems).to.equal(true)
        expect(result.otherItems).to.equal(true)
        expect(result.matchProperties).to.deep.equal([['Template', 'Dice'], ['IsRezzed', null]])
        expect(result.pidsToSend).to.deep.equal(['Id', 'Template'])
    }

    // isMatchingItem

    isMatchingItem_ownItems_false_rejects_own_accepts_other() {
        const sub = new ItemUpdateSubscription(false, true, [], [])
        expect(sub.isMatchingItem({ Id: 'item1' }, true)).to.equal(false)
        expect(sub.isMatchingItem({ Id: 'item1' }, false)).to.equal(true)
    }

    isMatchingItem_otherItems_false_accepts_own_rejects_other() {
        const sub = new ItemUpdateSubscription(true, false, [], [])
        expect(sub.isMatchingItem({ Id: 'item1' }, true)).to.equal(true)
        expect(sub.isMatchingItem({ Id: 'item1' }, false)).to.equal(false)
    }

    isMatchingItem_value_matchProperty_matches_exact_value_only() {
        const sub = new ItemUpdateSubscription(true, true, [['Template', 'Dice']], [])
        expect(sub.isMatchingItem({ Template: 'Dice' }, true)).to.equal(true)
        expect(sub.isMatchingItem({ Template: 'Coin' }, true)).to.equal(false)
        expect(sub.isMatchingItem({ Id: 'item1' }, true)).to.equal(false)
    }

    isMatchingItem_null_matchProperty_requires_truthy_value() {
        const sub = new ItemUpdateSubscription(true, true, [['IsRezzed', null]], [])
        expect(sub.isMatchingItem({ IsRezzed: 'true' }, true)).to.equal(true)
        expect(sub.isMatchingItem({ IsRezzed: 'yes' }, true)).to.equal(true)
        expect(sub.isMatchingItem({ IsRezzed: '1' }, true)).to.equal(true)
        expect(sub.isMatchingItem({ IsRezzed: 'false' }, true)).to.equal(false)
        expect(sub.isMatchingItem({ IsRezzed: 'no' }, true)).to.equal(false)
        expect(sub.isMatchingItem({ IsRezzed: '0' }, true)).to.equal(false)
        expect(sub.isMatchingItem({ IsRezzed: '' }, true)).to.equal(false)
        expect(sub.isMatchingItem({ Id: 'item1' }, true)).to.equal(false)
    }

    isMatchingItem_all_matchProperties_must_pass() {
        const sub = new ItemUpdateSubscription(true, true, [['Template', 'Dice'], ['IsRezzed', null]], [])
        expect(sub.isMatchingItem({ Template: 'Dice' }, true)).to.equal(false)
        expect(sub.isMatchingItem({ IsRezzed: 'true' }, true)).to.equal(false)
        expect(sub.isMatchingItem({ Template: 'Dice', IsRezzed: 'true' }, true)).to.equal(true)
    }

    // getPidsToSend

    getPidsToSend_returns_all_item_keys_when_pidsToSend_is_empty() {
        const sub = new ItemUpdateSubscription(true, true, [], [])
        const item = { Id: 'item1', Template: 'Dice', IsRezzed: 'true' }
        expect(sub.getPidsToSend(item)).to.have.members(['Id', 'Template', 'IsRezzed'])
    }

    getPidsToSend_returns_specified_pids_when_set() {
        const sub = new ItemUpdateSubscription(true, true, [], ['Id', 'Template'])
        const item = { Id: 'item1', Template: 'Dice', IsRezzed: 'true' }
        expect(sub.getPidsToSend(item)).to.deep.equal(['Id', 'Template'])
    }

    // getPropertiesToSendBySubscriptions

    getPropertiesToSendBySubscriptions_returns_null_when_no_subscriptions_match() {
        const sub = new ItemUpdateSubscription(true, false, [], [])
        const item = { Id: 'item1' }
        const result = ItemUpdateSubscription.getPropertiesToSendBySubscriptions([sub], item, false)
        expect(result).to.equal(null)
    }

    getPropertiesToSendBySubscriptions_returns_null_for_empty_subscriptions() {
        const item = { Id: 'item1' }
        const result = ItemUpdateSubscription.getPropertiesToSendBySubscriptions([], item, true)
        expect(result).to.equal(null)
    }

    getPropertiesToSendBySubscriptions_returns_full_item_when_matching_sub_has_no_pidsToSend() {
        const sub = new ItemUpdateSubscription(true, false, [], [])
        const item = { Id: 'item1', Template: 'Dice' }
        const result = ItemUpdateSubscription.getPropertiesToSendBySubscriptions([sub], item, true)
        expect(result).to.equal(item)
    }

    getPropertiesToSendBySubscriptions_returns_filtered_properties_for_pidsToSend() {
        const sub = new ItemUpdateSubscription(true, false, [], ['Id'])
        const item = { Id: 'item1', Template: 'Dice' }
        const result = ItemUpdateSubscription.getPropertiesToSendBySubscriptions([sub], item, true)
        expect(result).to.deep.equal({ Id: 'item1' })
    }

    getPropertiesToSendBySubscriptions_merges_pidsToSend_from_multiple_matching_subs() {
        const sub1 = new ItemUpdateSubscription(true, false, [], ['Id'])
        const sub2 = new ItemUpdateSubscription(true, false, [], ['Template'])
        const item = { Id: 'item1', Template: 'Dice', IsRezzed: 'true' }
        const result = ItemUpdateSubscription.getPropertiesToSendBySubscriptions([sub1, sub2], item, true)
        expect(result).to.deep.equal({ Id: 'item1', Template: 'Dice' })
    }

    getPropertiesToSendBySubscriptions_returns_full_item_when_one_matching_sub_has_no_pidsToSend() {
        const sub1 = new ItemUpdateSubscription(true, false, [], ['Id'])
        const sub2 = new ItemUpdateSubscription(true, false, [], [])
        const item = { Id: 'item1', Template: 'Dice' }
        const result = ItemUpdateSubscription.getPropertiesToSendBySubscriptions([sub1, sub2], item, true)
        expect(result).to.equal(item)
    }
}
