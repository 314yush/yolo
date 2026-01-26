# Relay Provider Architecture

This directory contains the modular relay provider implementations for gas sponsorship services.

## Architecture

The relay system is designed with a provider abstraction pattern to allow easy switching and comparison between different relay services (Tachyon, Gelato, etc.).

### Core Components

1. **`relayProvider.ts`** - Interface definition (`IRelayProvider`)
   - Defines the contract all providers must implement
   - Provides type-safe provider selection

2. **`relayService.ts`** - Service layer
   - Manages provider instances
   - Handles provider switching
   - Provides unified API for relaying transactions
   - Includes performance comparison utilities

3. **Provider Implementations**
   - `tachyonProvider.ts` - Tachyon relay implementation
   - `gelatoProvider.ts` - Gelato relay implementation (stub)

## Usage

### Basic Usage (Default Provider)

```typescript
import { relayService } from '@/lib/relayService';

// Relay a trade (uses default provider, currently Tachyon)
const result = await relayService.relayTrade({
  delegatePrivateKey: '0x...',
  targetContract: '0x...',
  calldata: '0x...',
  value: BigInt(0),
});
```

### Switching Providers

```typescript
import { relayService } from '@/lib/relayService';

// Switch to Gelato
relayService.setProvider('gelato');

// Now all relay calls will use Gelato
const result = await relayService.relayTrade({...});
```

### Using the Hook

```typescript
import { useRelayProvider } from '@/hooks/useRelayProvider';

function MyComponent() {
  const { currentProvider, setProvider, configuredProviders } = useRelayProvider();
  
  return (
    <select value={currentProvider} onChange={(e) => setProvider(e.target.value)}>
      {configuredProviders.map(p => (
        <option key={p} value={p}>{p}</option>
      ))}
    </select>
  );
}
```

### Performance Comparison

```typescript
import { relayService } from '@/lib/relayService';

// Compare performance between providers
const results = await relayService.compareProviders({
  delegatePrivateKey: '0x...',
  targetContract: '0x...',
  calldata: '0x...',
}, ['tachyon', 'gelato']);

console.log('Tachyon:', results.tachyon.timeMs, 'ms');
console.log('Gelato:', results.gelato.timeMs, 'ms');
```

## Adding a New Provider

1. Create a new provider file (e.g., `myProvider.ts`)
2. Implement the `IRelayProvider` interface:

```typescript
import type { IRelayProvider, RelayTradeParams, RelayResult } from '../relayProvider';

export class MyRelayProvider implements IRelayProvider {
  readonly name = 'myprovider';

  isConfigured(): boolean {
    // Check if provider is configured
    return true;
  }

  getStatus() {
    return {
      configured: this.isConfigured(),
      details: { /* provider-specific details */ },
    };
  }

  async relayTrade(params: RelayTradeParams): Promise<RelayResult> {
    // Implement relay logic
    return {
      txHash: '0x...',
      metadata: { /* optional metadata */ },
    };
  }
}
```

3. Register it in `relayService.ts`:

```typescript
import { MyRelayProvider } from './providers/myProvider';

constructor() {
  // ...
  this.providers.set('myprovider', new MyRelayProvider());
}
```

4. Add the provider type to `RelayProviderType` in `relayProvider.ts`:

```typescript
export type RelayProviderType = 'tachyon' | 'gelato' | 'myprovider';
```

## Timing & Performance

All providers include timing instrumentation:
- Nonce fetch time
- UserOp build time
- Relay submission time
- Total execution time

Metadata is returned in the `RelayResult` for performance analysis.

## Current Status

- ✅ **Tachyon**: Fully implemented and working
- 🚧 **Gelato**: Stub implementation (ready for integration)
