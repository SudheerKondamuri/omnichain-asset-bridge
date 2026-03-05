export const GovernanceVotingABI = [
  {
    type: 'event',
    name: 'ProposalPassed',
    inputs: [
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: false, name: 'action', type: 'uint8' },
    ],
  },
  {
    type: 'event',
    name: 'ProposalCreated',
    inputs: [
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: false, name: 'description', type: 'string' },
      { indexed: false, name: 'action', type: 'uint8' },
      { indexed: false, name: 'deadline', type: 'uint256' },
    ],
  },
] as const;
