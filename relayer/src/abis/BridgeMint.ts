export const BridgeMintABI = [
  {
    type: 'event',
    name: 'Minted',
    inputs: [
      { indexed: true, name: 'user', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'nonce', type: 'uint256' },
      { indexed: false, name: 'sourceChainId', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'Burned',
    inputs: [
      { indexed: true, name: 'user', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'nonce', type: 'uint256' },
      { indexed: false, name: 'destinationChainId', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'mintWrapped',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'sourceChainId', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'burnWrapped',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'destinationChainId', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'processedSourceNonces',
    stateMutability: 'view',
    inputs: [
      { name: '', type: 'uint256' },
      { name: '', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;
