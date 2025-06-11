# Onyx

A lightweight state management library built on top of [@legendapp/state](https://github.com/LegendApp/legend-state). 

⚠️ This is a POC and is not ready for production.

## Comparison with react-native-onyx

This library aims to be a drop-in replacement for [react-native-onyx](https://github.com/Expensify/react-**native**-onyx) while providing better performance and a smaller bundle size.

### In memory performance tests

Tests were implemented in a popular benchmark suite: https://github.com/krausest/js-framework-benchmark (same test code for both implementations). Standard benchmark results are shown below.

![Onyx Comparison (in memory)](assets/Onyx%20Comparison%20(in%20memory).png)

### IndexedDB performance tests

Onyx is all about persistence, so I also tested it with IndexedDB and made special test suite for that.

![Onyx Comparison (indexedDB)](assets/Onyx%20Comparison%20(indexedDB).png)


## Installation

```bash
npm i
npm run build // this will generate the dist folder
```

## API Reference

### Methods

#### `init({ keys, initialKeyStates })`
Initialize Onyx with default states.

```typescript
Onyx.init({
  initialKeyStates: {
    user: { name: 'John' },
    settings: { theme: 'dark' }
  }
});
```

#### `connect({ key, callback })`
Connect to a specific key and receive updates.

```typescript
const connection = Onyx.connect({
  key: 'user',
  callback: (value, key) => {
    console.log(`Value for ${key} changed:`, value);
  }
});

// Later, disconnect when no longer needed
connection.disconnect();
```

#### `set(key, value)`
Set a value for a specific key.

```typescript
await Onyx.set('user', { name: 'Jane' });
```

#### `multiSet(values)`
Set multiple values at once.

```typescript
await Onyx.multiSet({
  user: { name: 'Jane' },
  settings: { theme: 'light' }
});
```

#### `merge(key, value)`
Merge a value with existing data for a key.

```typescript
await Onyx.merge('user', { age: 25 }); // Merges with existing user data
```

#### `mergeCollection(key, values)`
Merge multiple values into a collection.

```typescript
await Onyx.mergeCollection('users', {
  user1: { name: 'John' },
  user2: { name: 'Jane' }
});
```

#### `setCollection(key, values)`
Set a collection of values for a key.

```typescript
await Onyx.setCollection('users', {
  user1: { name: 'John' },
  user2: { name: 'Jane' }
});
```

#### `update(updates)`
Perform multiple updates in a single batch.

```typescript
await Onyx.update([
  { onyxMethod: Onyx.METHOD.SET, key: 'user', value: { name: 'John' } },
  { onyxMethod: Onyx.METHOD.MERGE, key: 'settings', value: { theme: 'dark' } }
]);
```

#### `clear()`
Clear all data and reset to initial states.

```typescript
await Onyx.clear();
```

#### `get(key)`
Get the current value for a key.

```typescript
const user = await Onyx.get('user');
```

### Available Methods for Update

```typescript
Onyx.METHOD = {
  SET: 'set',
  MERGE: 'merge',
  MERGE_COLLECTION: 'mergeCollection',
  SET_COLLECTION: 'setCollection',
  MULTI_SET: 'multiSet',
  CLEAR: 'clear'
};
```

## Usage Example

```typescript
import Onyx from '@swmansion/react-native-legend-onyx';

// Initialize Onyx
await Onyx.init({
  initialKeyStates: {
    user: null,
    settings: { theme: 'light' }
  }
});

// Connect to changes
const connection = Onyx.connect({
  key: 'user',
  callback: (value) => {
    console.log('User updated:', value);
  }
});

// Update data
await Onyx.set('user', { name: 'John', age: 30 });
await Onyx.merge('settings', { notifications: true });

// Get current value
const user = await Onyx.get('user');

// Clean up
connection.disconnect();
```

## Features

- Lightweight and performant
- Built on top of @legendapp/state
- Supports batching updates
- TypeScript support
- Simple and intuitive API

## TODO

- Evictable keys
- Snapshots
- Onyx migrations
- disconnect inside of connect // treat it as an anti pattern
