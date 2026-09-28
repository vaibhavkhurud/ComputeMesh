import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Page from '../src/app/page';

describe('Page Component', () => {
  it('renders correctly', () => {
    render(<Page />);
    
    expect(screen.getByText('ComputeMesh')).toBeInTheDocument();
    expect(screen.getByText('Distributed Compute Marketplace')).toBeInTheDocument();
  });
});
