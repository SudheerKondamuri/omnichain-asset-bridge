export const GovernanceEmergencyABI = [
  {
    type: 'function',
    name: 'executeAction',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'proposalId', type: 'uint256' },
      { name: 'sourceChainId', type: 'uint256' },
      { name: 'action', type: 'uint8' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'processedProposals',
    stateMutability: 'view',
    inputs: [
      { name: '', type: 'uint256' },
      { name: '', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;
