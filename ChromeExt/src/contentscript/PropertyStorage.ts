import { ObservableProperty, IObserver } from '../lib/ObservableProperty';
import { LegacyIdentity } from './LegacyIdentity';

export class PropertyStorage
{
    private identities: { [entity: string]: LegacyIdentity; } = {};
    private properties: { [combinedKey: string]: ObservableProperty; } = {};

    private combineKey(entity: string, key: string) { return entity + ':' + key; }

    setIdentity(entity: string, url: string, digest: string)
    {
        if (!(entity in this.identities)) {
            this.identities[entity] = new LegacyIdentity(this, entity);
        }
        this.identities[entity].changed(url, digest);
    }

    attach(entity: string, key: string, observer: IObserver)
    {
        var combinedKey = this.combineKey(entity, key);
        if (combinedKey in this.properties) {
            this.properties[combinedKey].attach(observer);
        }
    }

    detach(entity: string, key: string, observer: IObserver)
    {
        var combinedKey = this.combineKey(entity, key);
        if (combinedKey in this.properties) {
            this.properties[combinedKey].detach(observer);
        }
    }

    setProperty(entity: string, key: string, value: string)
    {
        // Log.debug('PropertyStorage.setProperty', entity, key,value);
        this.setObservable(entity, key, value);
    }

    watch(entity: string, key: string, observer: IObserver)
    {
        var combinedKey = this.combineKey(entity, key);
        if (!(combinedKey in this.properties)) {
            this.properties[combinedKey] = new ObservableProperty(key);
        }
        this.properties[combinedKey].notifyOne(observer);
        this.properties[combinedKey].attach(observer);
    }

    private setObservable(entity: string, key: string, value: string)
    {
        var combinedKey = this.combineKey(entity, key);
        if (!(combinedKey in this.properties)) {
            this.properties[combinedKey] = new ObservableProperty(key);
        }
        this.properties[combinedKey].set(value);
    }
}
