import { useState, useEffect } from 'react';
import { User, Shift, Register, Device, CartItem, Product, Customer } from '../types';
import { generateUUID } from '../utils/id';
import { calculateLineTotal } from '../utils/money';
import { CompleteSaleResult } from '../services/saleService';
import { db } from '../db';
import { deviceService } from '../services/deviceService';

export interface SuspendedSale {
  id: string;
  customer: Customer | null;
  cartItems: CartItem[];
  cartDiscountPercent: number;
  cartDiscountFixed: number;
  created_at: string;
  notes?: string;
}

export interface PosState {
  currentUser: User | null;
  activeShift: Shift | null;
  activeRegister: Register | null;
  activeDevice: Device | null;
  currentSaleId: string;
  cartItems: CartItem[];
  selectedCustomer: Customer | null;
  cartDiscountPercent: number;
  cartDiscountFixed: number;
  activeWorkflowStep: number; // 1 to 18 following authoritative diagram
  activeView:
    | 'pos'
    | 'sales'
    | 'dashboard'
    | 'inventory'
    | 'customers'
    | 'shifts'
    | 'reports'
    | 'admin'
    | 'administration'
    | 'settings'
    | 'system';
  lastCompletedSaleResult: CompleteSaleResult | null;
  isOpeningShiftOpen: boolean;
  isClosingShiftOpen: boolean;
  isPaymentModalOpen: boolean;
  isReceiptModalOpen: boolean;
  isCustomerModalOpen: boolean;
  isStockAlertOpen: boolean;
  isProductNotFoundOpen: boolean;
  stockAlertMessage: string;
  searchedNotFoundTerm: string;
  suspendedSales: SuspendedSale[];
  isSuspendedSalesOpen: boolean;
  isCalculatorOpen: boolean;
  isIssueLoyaltyCardOpen: boolean;
  isUserProfileOpen: boolean;
}

type PosStoreListener = (state: PosState) => void;

class PosStore {
  private state: PosState = {
    currentUser: null,
    activeShift: null,
    activeRegister: null,
    activeDevice: null,
    currentSaleId: generateUUID(),
    cartItems: [],
    selectedCustomer: null,
    cartDiscountPercent: 0,
    cartDiscountFixed: 0,
    activeWorkflowStep: 1, // Start at Cashier Login
    activeView: 'pos',
    lastCompletedSaleResult: null,
    isOpeningShiftOpen: false,
    isClosingShiftOpen: false,
    isPaymentModalOpen: false,
    isReceiptModalOpen: false,
    isCustomerModalOpen: false,
    isStockAlertOpen: false,
    isProductNotFoundOpen: false,
    stockAlertMessage: '',
    searchedNotFoundTerm: '',
    suspendedSales: [],
    isSuspendedSalesOpen: false,
    isCalculatorOpen: false,
    isIssueLoyaltyCardOpen: false,
    isUserProfileOpen: false,
  };

  private listeners: Set<PosStoreListener> = new Set();

  constructor() {
    this.initSession();
  }

  public getState(): PosState {
    return this.state;
  }

  public subscribe(listener: PosStoreListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    this.listeners.forEach(l => l({ ...this.state }));
  }

  public setState(partial: Partial<PosState>) {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  public async initSession() {
    try {
      const status = await deviceService.getDeviceStatus();
      const register = status.register || (await db.registers.where('is_active').equals(1).first()) || null;
      const device = status.device;

      // Check if there is an active open shift
      const activeShift = await db.shifts.where('status').equals('open').first();

      let activeUser: User | null = null;
      const storedUserId = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('pos_active_user_id') : null;
      if (storedUserId) {
        activeUser = (await db.users.get(storedUserId)) || null;
      }
      if (!activeUser && activeShift) {
        activeUser = (await db.users.get(activeShift.cashier_id)) || null;
      }

      this.setState({
        activeRegister: register || null,
        activeDevice: device || null,
        activeShift: activeShift || null,
        currentUser: activeUser,
        activeWorkflowStep: activeUser && activeShift ? 3 : 1, // If shift open -> Dashboard/POS, else Login
        activeView: activeUser && activeShift ? (activeUser.role === 'cashier' ? 'pos' : 'dashboard') : 'pos',
      });
    } catch (e) {
      console.warn('Init session error:', e);
    }
  }

  /**
   * Authoritative Step 4: NEW SALE
   * Creates a local transaction session with unique sale UUID and resets cart
   */
  public startNewSale() {
    this.setState({
      currentSaleId: generateUUID(),
      cartItems: [],
      selectedCustomer: null,
      cartDiscountPercent: 0,
      cartDiscountFixed: 0,
      activeWorkflowStep: 4, // New Sale started, ready to scan/search (Step 5)
      activeView: 'pos',
      lastCompletedSaleResult: null,
      isPaymentModalOpen: false,
      isReceiptModalOpen: false,
      isCustomerModalOpen: false,
      isStockAlertOpen: false,
      isProductNotFoundOpen: false,
    });
  }

  /**
   * Authoritative Step 7: ADD TO CART
   * Enforces stock validation (Step 6)
   */
  public addToCart(product: Product, quantityToAdd: number = 1, lineDiscount: number = 0): boolean {
    const existingIndex = this.state.cartItems.findIndex(i => i.product.id === product.id);
    const currentCartQty = existingIndex >= 0 ? this.state.cartItems[existingIndex].quantity : 0;
    const requestedTotalQty = currentCartQty + quantityToAdd;

    // Step 6: Check Stock decision
    if (requestedTotalQty > product.stock_quantity) {
      this.setState({
        isStockAlertOpen: true,
        stockAlertMessage: `Insufficient stock for "${product.name}". Available: ${product.stock_quantity}, In cart: ${currentCartQty}, Requested: +${quantityToAdd}.`,
      });
      return false;
    }

    let updatedCart = [...this.state.cartItems];
    if (existingIndex >= 0) {
      const existing = updatedCart[existingIndex];
      const newQty = existing.quantity + quantityToAdd;
      updatedCart[existingIndex] = {
        ...existing,
        quantity: newQty,
        item_total: calculateLineTotal(existing.unit_price, existing.discount_amount, newQty),
      };
    } else {
      updatedCart.push({
        product,
        quantity: quantityToAdd,
        unit_price: product.selling_price,
        discount_amount: lineDiscount,
        tax_rate: product.tax_rate,
        item_total: calculateLineTotal(product.selling_price, lineDiscount, quantityToAdd),
      });
    }

    this.setState({
      cartItems: updatedCart,
      activeWorkflowStep: 7, // Step 7 Add to Cart reached
    });
    return true;
  }

  /**
   * Authoritative Step 8: REVIEW CART - Update quantity
   */
  public updateCartItemQuantity(productId: string, newQuantity: number): boolean {
    if (newQuantity <= 0) {
      this.removeCartItem(productId);
      return true;
    }

    const item = this.state.cartItems.find(i => i.product.id === productId);
    if (!item) return false;

    // Validate stock
    if (newQuantity > item.product.stock_quantity) {
      this.setState({
        isStockAlertOpen: true,
        stockAlertMessage: `Cannot set quantity to ${newQuantity}. Maximum available stock is ${item.product.stock_quantity}.`,
      });
      return false;
    }

    const updatedCart = this.state.cartItems.map(i => {
      if (i.product.id === productId) {
        return {
          ...i,
          quantity: newQuantity,
          item_total: calculateLineTotal(i.unit_price, i.discount_amount, newQuantity),
        };
      }
      return i;
    });

    this.setState({ cartItems: updatedCart });
    return true;
  }

  /**
   * Authoritative Step 8: REVIEW CART - Remove Item
   */
  public removeCartItem(productId: string) {
    const updatedCart = this.state.cartItems.filter(i => i.product.id !== productId);
    this.setState({ cartItems: updatedCart });
  }

  /**
   * Authoritative Step 8: REVIEW CART - Line Discount & Note
   */
  public updateCartItemMeta(productId: string, discountAmount: number, note?: string) {
    const updatedCart = this.state.cartItems.map(i => {
      if (i.product.id === productId) {
        return {
          ...i,
          discount_amount: discountAmount,
          note,
          item_total: calculateLineTotal(i.unit_price, discountAmount, i.quantity),
        };
      }
      return i;
    });
    this.setState({ cartItems: updatedCart });
  }

  /**
   * Authoritative Step 8: Apply Cart-level discount
   */
  public setCartDiscount(percent: number, fixed: number) {
    this.setState({
      cartDiscountPercent: percent,
      cartDiscountFixed: fixed,
    });
  }

  /**
   * Authoritative Step 8: REVIEW CART
   */
  public proceedToReviewCart() {
    this.setState({ activeWorkflowStep: 8, activeView: 'pos' });
  }

  /**
   * Authoritative Step 9: CUSTOMER Selection
   */
  public selectCustomer(customer: Customer | null) {
    this.setState({ selectedCustomer: customer });
  }

  public proceedToCustomer() {
    this.setState({ activeWorkflowStep: 9, isCustomerModalOpen: true });
  }

  /**
   * Authoritative Step 10: PAYMENT
   */
  public proceedToPayment() {
    this.setState({ activeWorkflowStep: 10, isPaymentModalOpen: true });
  }

  /**
   * Authoritative Step 12: RECEIPT
   */
  public proceedToReceipt(result: CompleteSaleResult) {
    this.setState({
      lastCompletedSaleResult: result,
      activeWorkflowStep: 12,
      isPaymentModalOpen: false,
      isReceiptModalOpen: true,
    });
  }

  /**
   * Authoritative Step 16: SALE COMPLETED
   */
  public proceedToSaleCompleted() {
    this.setState({
      activeWorkflowStep: 16,
      isReceiptModalOpen: false,
    });
  }

  /**
   * Authoritative Step 17: NEXT CUSTOMER
   * Clears transaction and restarts at Step 4 (New Sale)
   */
  public proceedToNextCustomer() {
    this.startNewSale();
  }

  /**
   * Authoritative Step 18: CLOSE SHIFT
   */
  public openCloseShiftModal() {
    this.setState({
      activeWorkflowStep: 18,
      isClosingShiftOpen: true,
    });
  }

  public suspendCurrentSale(notes?: string): boolean {
    if (this.state.cartItems.length === 0) return false;
    const suspended: SuspendedSale = {
      id: generateUUID(),
      customer: this.state.selectedCustomer,
      cartItems: [...this.state.cartItems],
      cartDiscountPercent: this.state.cartDiscountPercent,
      cartDiscountFixed: this.state.cartDiscountFixed,
      created_at: new Date().toISOString(),
      notes: notes || 'Suspended sale',
    };
    this.setState({
      suspendedSales: [suspended, ...this.state.suspendedSales],
      cartItems: [],
      selectedCustomer: null,
      cartDiscountPercent: 0,
      cartDiscountFixed: 0,
      currentSaleId: generateUUID(),
      activeWorkflowStep: 4,
    });
    return true;
  }

  public restoreSuspendedSale(id: string): boolean {
    const sale = this.state.suspendedSales.find(s => s.id === id);
    if (!sale) return false;
    this.setState({
      suspendedSales: this.state.suspendedSales.filter(s => s.id !== id),
      cartItems: sale.cartItems,
      selectedCustomer: sale.customer,
      cartDiscountPercent: sale.cartDiscountPercent,
      cartDiscountFixed: sale.cartDiscountFixed,
      currentSaleId: generateUUID(),
      activeWorkflowStep: 8,
      isSuspendedSalesOpen: false,
    });
    return true;
  }

  public removeSuspendedSale(id: string): void {
    this.setState({
      suspendedSales: this.state.suspendedSales.filter(s => s.id !== id),
    });
  }

  public setSuspendedSalesOpen(open: boolean): void {
    this.setState({ isSuspendedSalesOpen: open });
  }

  public setCalculatorOpen(open: boolean): void {
    this.setState({ isCalculatorOpen: open });
  }

  public setIssueLoyaltyCardOpen(open: boolean): void {
    this.setState({ isIssueLoyaltyCardOpen: open });
  }

  public setUserProfileOpen(open: boolean): void {
    this.setState({ isUserProfileOpen: open });
  }

  public logout() {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('pos_active_user_id');
    }
    this.setState({
      currentUser: null,
      activeWorkflowStep: 1, // Return to Cashier Login
      activeView: 'pos',
      cartItems: [],
      selectedCustomer: null,
      isOpeningShiftOpen: false,
      isClosingShiftOpen: false,
    });
  }
}

export const posStore = new PosStore();

/**
 * Custom React Hook for connecting components to POS state
 */
export function usePos() {
  const [state, setState] = useState<PosState>(posStore.getState());

  useEffect(() => {
    return posStore.subscribe(newState => setState(newState));
  }, []);

  return {
    ...state,
    startNewSale: () => posStore.startNewSale(),
    addToCart: (product: Product, qty?: number, disc?: number) => posStore.addToCart(product, qty, disc),
    updateCartItemQuantity: (id: string, qty: number) => posStore.updateCartItemQuantity(id, qty),
    removeCartItem: (id: string) => posStore.removeCartItem(id),
    updateCartItemMeta: (id: string, disc: number, note?: string) => posStore.updateCartItemMeta(id, disc, note),
    setCartDiscount: (percent: number, fixed: number) => posStore.setCartDiscount(percent, fixed),
    selectCustomer: (cust: Customer | null) => posStore.selectCustomer(cust),
    proceedToReviewCart: () => posStore.proceedToReviewCart(),
    proceedToCustomer: () => posStore.proceedToCustomer(),
    proceedToPayment: () => posStore.proceedToPayment(),
    proceedToReceipt: (result: CompleteSaleResult) => posStore.proceedToReceipt(result),
    proceedToSaleCompleted: () => posStore.proceedToSaleCompleted(),
    proceedToNextCustomer: () => posStore.proceedToNextCustomer(),
    openCloseShiftModal: () => posStore.openCloseShiftModal(),
    suspendCurrentSale: (notes?: string) => posStore.suspendCurrentSale(notes),
    restoreSuspendedSale: (id: string) => posStore.restoreSuspendedSale(id),
    removeSuspendedSale: (id: string) => posStore.removeSuspendedSale(id),
    setSuspendedSalesOpen: (open: boolean) => posStore.setSuspendedSalesOpen(open),
    setCalculatorOpen: (open: boolean) => posStore.setCalculatorOpen(open),
    setIssueLoyaltyCardOpen: (open: boolean) => posStore.setIssueLoyaltyCardOpen(open),
    setUserProfileOpen: (open: boolean) => posStore.setUserProfileOpen(open),
    setCurrentUser: (user: User | null) => {
      if (typeof sessionStorage !== 'undefined') {
        if (user) {
          sessionStorage.setItem('pos_active_user_id', user.id);
        } else {
          sessionStorage.removeItem('pos_active_user_id');
        }
      }
      posStore.setState({ currentUser: user });
    },
    setActiveShift: (shift: Shift | null) => posStore.setState({ activeShift: shift }),
    setActiveRegister: (register: Register | null) => posStore.setState({ activeRegister: register }),
    setActiveDevice: (device: Device | null) => posStore.setState({ activeDevice: device }),
    setActiveWorkflowStep: (step: number) =>
      posStore.setState({ activeWorkflowStep: Math.max(1, Math.min(18, Math.round(step))) }),
    setActiveView: (view: PosState['activeView']) => posStore.setState({ activeView: view }),
    setOpeningShiftOpen: (open: boolean) => posStore.setState({ isOpeningShiftOpen: open }),
    setClosingShiftOpen: (open: boolean) => posStore.setState({ isClosingShiftOpen: open }),
    setPaymentModalOpen: (open: boolean) => posStore.setState({ isPaymentModalOpen: open }),
    setReceiptModalOpen: (open: boolean) => posStore.setState({ isReceiptModalOpen: open }),
    setCustomerModalOpen: (open: boolean) => posStore.setState({ isCustomerModalOpen: open }),
    setStockAlertOpen: (open: boolean, msg: string = '') =>
      posStore.setState({ isStockAlertOpen: open, stockAlertMessage: msg }),
    setProductNotFoundOpen: (open: boolean, term: string = '') =>
      posStore.setState({ isProductNotFoundOpen: open, searchedNotFoundTerm: term }),
    setLastCompletedSaleResult: (res: CompleteSaleResult | null) =>
      posStore.setState({ lastCompletedSaleResult: res }),
    logout: () => posStore.logout(),
  };
}
