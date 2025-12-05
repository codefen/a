import { isObject, getNestedValue, deepEqual } from './util';
import { SPECIAL_OBJ_PROPERTIES } from './consts';

class AppGlobalState {
  /** Estado global */
  state;

  /** Callback de los suscriptores */
  _subscribers = {};

  /** @type {WeakMap} Almacena en cache los proxy que ya han sido creados */
  _proxyCache = new WeakMap();

  /** @type {boolean} Bandera para continuar con la siguiente update */
  _batchUpdate = false;

  /** @type {Set} Almacena las actualizaciones pendientes */
  _pendingUpdates = new Set();

  _pathCache = new Map();

  _compiledPaths = new Map();

  /** @type {AppGlobalState} Almacena la referencia del AppGlobalState */
  static instance;

  constructor(initialState = {}) {
    if (AppGlobalState.instance) {
      return AppGlobalState.instance;
    }
    this.state = this.#createProxy(initialState);

    AppGlobalState.instance = this;
  }

  #createProxy(obj, path = []) {
    if (!isObject(obj)) {
      return obj;
    }

    if (this._proxyCache.has(obj)) {
      return this._proxyCache.get(obj);
    }

    const proxy = new Proxy(obj, {
      set: (target, property, value) => {
        try {
          const oldValue = target[property];
          const newValue = this.#createProxy(value, [...path, property]);
          if (!deepEqual(oldValue, newValue)) {
            target[property] = newValue;
            const key = [...path, property].join('.');
            if (this._batchUpdate) {
              this._pendingUpdates.add(key);
            } else {
              this.#notify(key, newValue, oldValue);
            }
          }
          return true;
        } catch (e) {
          console.error(`Error setting property ${property}:`, e);
          return false;
        }
      },
      get: (target, property) => {
        try {
          if (typeof property === 'symbol' || SPECIAL_OBJ_PROPERTIES.has(property)) {
            return Reflect.get(target, property);
          }

          const value = target[property];
          if (isObject(value)) {
            const cacheKey = `${property}`;
            if (this._pathCache.has(cacheKey)) {
              return this._pathCache.get(cacheKey);
            }
            const newPath = [...path, property];
            const newProxy = this.#createProxy(value, newPath);
            this._pathCache.set(cacheKey, newProxy);
            return newProxy;
          }
          return value;
        } catch (e) {
          console.error(`Error getting property ${property}:`, e);
          return undefined;
        }
      },
    });

    this._proxyCache.set(obj, proxy);
    return proxy;
  }

  subscribe(key, callback) {
    if (!this._subscribers[key]) {
      this._subscribers[key] = new Set();
    }
    this._subscribers[key].add(callback);
    return () => this.unsubscribe(key, callback);
  }

  unsubscribe(key, callback) {
    if (this._subscribers[key]) {
      this._subscribers[key].delete(callback);
      if (this._subscribers[key].size === 0) {
        delete this._subscribers[key];
      }
    }
  }

  #notify(key, newValue, oldValue) {
    if (this._subscribers[key]) {
      this._subscribers[key].forEach(callback => callback(newValue, oldValue, key));
    }
  }

  setState(newState) {
    this._batchUpdate = true;
    this.#deepMerge(this.state, newState);
    this._batchUpdate = false;
    localStorage.setItem('global', JSON.stringify(this.state));

    this._pendingUpdates.forEach(key => {
      const newValue = getNestedValue(this.state, key.split('.'));
      const oldValue = getNestedValue(this.state, key.split('.'));
      this.#notify(key, newValue, oldValue);
    });
    this._pendingUpdates.clear();
  }

  #deepMerge(target, source, path = []) {
    // Ensure target is not null/undefined
    if (!target || !source) return;
    
    Object.keys(source).forEach(key => {
      const newPath = [...path, key];
      const proxyKey = newPath.join('.');

      // Handle null values explicitly
      if (source[key] === null) {
        if (target[key] !== null) {
          target[key] = source[key];
          this._pendingUpdates.add(proxyKey);
        }
        return;
      }

      if (isObject(source[key])) {
        if (!(key in target) || target[key] === null) {
          target[key] = {};
        }
        this.#deepMerge(target[key], source[key], newPath);
        return;
      }
      if (!deepEqual(target[key], source[key])) {
        target[key] = source[key];
        this._pendingUpdates.add(proxyKey);
      }
    });
  }

  getState() {
    return this.state;
  }

}

const store = new AppGlobalState({

});

export { store };
