import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { LoginModal } from '../components/auth/LoginModal';
import { db } from '../db';
import { generateSalt, hashPin } from '../utils/id';
import { User } from '../types';
import { posStore } from '../store/posStore';
import { deviceService } from '../services/deviceService';
import { authService } from '../services/authService';
import { connectivityService } from '../services/connectivity';

describe('POS Login Interface — Commercial Workstation UI/UX', () => {
  const testRegisterId = '00000000-0000-0000-0000-000000000020';
  const testStoreId = '00000000-0000-0000-0000-000000000001';
  let testUser1: User;
  let testUser2: User;

  beforeEach(async () => {
    connectivityService.setSimulatedOffline(false);

    await db.devices.clear();
    await db.settings.clear();
    await db.users.clear();
    await db.registers.clear();
    await db.auditLogs.clear();
    await db.shifts.clear();
    await authService.clearCachedOfflineUsers();
    await deviceService.resetDeviceEnrollment();

    // Reset store state
    posStore.setState({
      currentUser: null,
      activeShift: null,
      isOpeningShiftOpen: false,
    });

    // Seed register
    await db.registers.add({
      id: testRegisterId,
      register_name: 'Counter 01 - Main Checkout',
      branch_name: 'Kampala Flagship',
      is_active: true,
    });

    // Enroll device
    await deviceService.enrollDevice({
      deviceId: 'term-station-01',
      registerId: testRegisterId,
      deviceName: 'Workstation Terminal Alpha',
      storeId: testStoreId,
    });

    // Seed Cashier 1
    const salt1 = generateSalt();
    const hash1 = await hashPin('1234', salt1);
    testUser1 = {
      id: '00000000-0000-0000-0000-000000000001',
      username: 'cashier1',
      full_name: 'Grace Nakato',
      role: 'cashier',
      pin_hash: hash1,
      salt: salt1,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await db.users.add(testUser1);

    // Seed Manager 2
    const salt2 = generateSalt();
    const hash2 = await hashPin('5555', salt2);
    testUser2 = {
      id: '00000000-0000-0000-0000-000000000002',
      username: 'manager1',
      full_name: 'David Ochieng',
      role: 'manager',
      pin_hash: hash2,
      salt: salt2,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await db.users.add(testUser2);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders enterprise workstation branding, store metadata, and terminal telemetry', async () => {
    render(<LoginModal />);

    // Brand and store titles
    await waitFor(() => {
      expect(screen.getAllByText(/Richie/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/ENTERPRISE/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Branch #101/i)).toBeInTheDocument();
      expect(screen.getByText(/Workstation Terminal Alpha/i)).toBeInTheDocument();
    });

    expect(screen.getAllByText(/Cloud Synchronized|Online/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Encrypted POS Session/i)).toBeInTheDocument();
  });

  it('renders register selector and lists authorized operators with role badges', async () => {
    render(<LoginModal />);

    await waitFor(() => {
      expect(screen.getAllByText(/Grace Nakato/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/David Ochieng/i).length).toBeGreaterThan(0);
    });

    // Verify role badges are rendered
    expect(screen.getAllByText('Cashier').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Store Manager').length).toBeGreaterThan(0);

    // Verify register terminal select option
    expect(screen.getByDisplayValue('Counter 01 - Main Checkout')).toBeInTheDocument();
  });

  it('allows selecting different operators from the directory', async () => {
    render(<LoginModal />);

    await waitFor(() => {
      expect(screen.getAllByText(/David Ochieng/i).length).toBeGreaterThan(0);
    });

    // Click on David Ochieng (Manager)
    const managerButton = screen.getAllByText(/David Ochieng/i)[0].closest('button');
    expect(managerButton).toBeTruthy();
    fireEvent.click(managerButton!);

    // Authenticating banner should now show David Ochieng & Store Manager
    await waitFor(() => {
      expect(screen.getAllByText(/@manager1/i).length).toBeGreaterThan(0);
    });
  });

  it('allows entering PIN via keyboard, toggling visibility, and clearing input', async () => {
    render(<LoginModal />);

    const pinInput = (await screen.findByPlaceholderText(
      'Enter access PIN or password'
    )) as HTMLInputElement;

    expect(pinInput.type).toBe('password');

    // Type PIN via keyboard
    fireEvent.change(pinInput, { target: { value: '1234' } });
    expect(pinInput.value).toBe('1234');

    // Toggle show password
    const toggleBtn = screen.getByLabelText(/Show PIN/i);
    fireEvent.click(toggleBtn);
    expect(pinInput.type).toBe('text');

    // Toggle hide password
    const hideBtn = screen.getByLabelText(/Hide PIN/i);
    fireEvent.click(hideBtn);
    expect(pinInput.type).toBe('password');

    // Clear input via clear button
    const clearBtn = screen.getByLabelText('Clear PIN input');
    fireEvent.click(clearBtn);
    expect(pinInput.value).toBe('');
  });

  it('supports entering PIN via on-screen numeric keypad', async () => {
    render(<LoginModal />);

    const pinInput = (await screen.findByPlaceholderText(
      'Enter access PIN or password'
    )) as HTMLInputElement;

    // Click keypad numbers '1', '2', '3'
    fireEvent.click(screen.getByRole('button', { name: '1' }));
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(pinInput.value).toBe('123');

    // Click backspace
    fireEvent.click(screen.getByLabelText('Backspace'));
    expect(pinInput.value).toBe('12');

    // Click keypad clear button (exact match 'CLEAR')
    fireEvent.click(screen.getByRole('button', { name: 'CLEAR' }));
    expect(pinInput.value).toBe('');
  });

  it('displays a clean human-friendly error message on incorrect credentials', async () => {
    render(<LoginModal />);

    await waitFor(() => {
      expect(screen.getAllByText(/Grace Nakato/i).length).toBeGreaterThan(0);
    });

    const cashierBtn = screen.getAllByText(/Grace Nakato/i)[0].closest('button');
    fireEvent.click(cashierBtn!);

    const pinInput = await screen.findByPlaceholderText('Enter access PIN or password');
    fireEvent.change(pinInput, { target: { value: '9999' } });

    const submitBtn = screen.getByRole('button', { name: /Sign In to Terminal/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Incorrect PIN or password\. Please verify your credentials and try again\./i)
      ).toBeInTheDocument();
    });
  });

  it('authenticates cashier successfully and opens shift initiation when shift is not yet open', async () => {
    render(<LoginModal />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getAllByText(/Grace Nakato/i).length).toBeGreaterThan(0);
    });

    const cashierBtn = screen.getAllByText(/Grace Nakato/i)[0].closest('button');
    fireEvent.click(cashierBtn!);

    const pinInput = await screen.findByPlaceholderText('Enter access PIN or password');
    fireEvent.change(pinInput, { target: { value: '1234' } });

    const submitBtn = screen.getByRole('button', { name: /Sign In to Terminal/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(posStore.getState().currentUser?.username).toBe('cashier1');
      expect(posStore.getState().isOpeningShiftOpen).toBe(true);
    });
  });
});
