import { render, screen } from '@testing-library/react-native';
import Index from './app/index';

// Tests live outside app/: expo-router would treat any file in app/ as a screen.
describe('Index screen', () => {
  it('renders the app name', async () => {
    await render(<Index />);
    expect(await screen.findByText('Wasla')).toBeTruthy();
  });
});
