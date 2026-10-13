// @base-org/account imports CdpClient for server-side subscription payments, which
// pulls in the whole Coinbase CDP + x402 stack. Korrin never uses those flows, so the
// bundler gets this stand-in. Calling it fails loudly instead of silently.
export class CdpClient {
  constructor() {
    throw new Error('Coinbase CDP client is not bundled in Korrin')
  }
}
