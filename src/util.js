export const $ = el => document.getElementById(el);
export const $FROM = (e, s) => e.querySelector(s);
export const $$ = el => document.querySelectorAll(el);
export const $FROM_ALL = (e, s) => e.querySelectorAll(s);

/**
 * Adds an event listener to the specified target.
 *
 * @template {Document | (Window & typeof globalThis) | FontFaceSet | HTMLElement | undefined | undefined | false} TargetType
 * @template {()=> void} UnsubscribeCallback
 *
 * @param {TargetType} target - The target to which the event listener will be added.
 * @param {keyof WindowEventMap | keyof DocumentEventMap | string} type - The type of event to listen for.
 * @param {(this: Document, ev: DocumentEventMap[K])=> any} listener - The callback function to execute when the event occurs.
 * @param {boolean | AddEventListenerOptions} [options] - An options object specifying characteristics about the event listener.
 *
 * @returns {UnsubscribeCallback} A function that, when called, will remove the event listener.
 */
export function addEventListener(target, type, listener, options) {
  if (!target) {
    return () => { };
  }
  target?.addEventListener?.(type, listener, options);
  return () => {
    target?.removeEventListener?.(type, listener, options);
  };
}

export const deepEqual = (obj1, obj2) => {
  if (obj1 === obj2) return true;

  if (
    typeof obj1 !== 'object' ||
    obj1 === null ||
    typeof obj2 !== 'object' ||
    obj2 === null
  )
    return false;
  // Obtiene las claves de ambos objetos
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  // Si los objetos tienen diferente número de claves, devuelve false
  if (keys1.length !== keys2.length) return false;
  for (const key of keys1) {
    if (!keys2.includes(key)) return false;

    if (typeof obj1[key] === 'object' && typeof obj2[key] === 'object') {
      if (!deepEqual(obj1[key], obj2[key])) return false;
    } else if (Array.isArray(obj1[key]) && Array.isArray(obj2[key])) {
      if (!arraysEqual(obj1[key], obj2[key])) return false;
    } else if (obj1[key] !== obj2[key]) return false;
  }
  return true;
};

export const arraysEqual = (arr1, arr2) => {
  if (arr1.length !== arr2.length) return false;
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) return false;
  }
  return true;
};

export const isObject = item => {
  return item && typeof item === 'object' && !Array.isArray(item);
};

export const getNestedValue = (obj, path) => {
  return path.reduce((current, key) => {
    if (current && Object.prototype.hasOwnProperty.call(current, key)) {
      return current[key];
    }
    return undefined;
  }, obj);
};

export const advancedDebounce = (callback, delay) => {
  let timeoutId = null;
  let lastArgs = null;

  const debounced = (...args) => {
    lastArgs = args;
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      lastArgs = null;
      callback(...args);
    }, delay);
  };

  debounced.flush = () => {
    clearTimeout(timeoutId);
    if (lastArgs) {
      callback(...lastArgs);
      lastArgs = null;
    }
  };

  debounced.cancel = () => {
    lastArgs = null;
    clearTimeout(timeoutId);
  };

  return debounced;
};