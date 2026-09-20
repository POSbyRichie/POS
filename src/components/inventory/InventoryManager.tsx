import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Package,
  Plus,
  Edit2,
  AlertTriangle,
  RefreshCw,
  Search,
  Tag,
  Barcode,
  Check,
  X,
  TrendingUp,
} from 'lucide-react';
import {
  productRepository,
  categoryRepository,
  inventoryRepository,
} from '../../db';
import { Product, Category, InventoryMovement, InventoryMovementType, StockFilterType } from '../../types';
import { inventoryService } from '../../services/inventoryService';
import { syncService } from '../../services/syncService';
import { usePos } from '../../store/posStore';
import { formatMoney } from '../../utils/money';

export const InventoryManager: React.FC = () => {
  const { currentUser, activeRegister } = usePos();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);

  // Navigation tabs matching authoritative hierarchy
  const [activeTab, setActiveTab] = useState<
    'products' | 'categories' | 'stock' | 'stock_in' | 'adjustments' | 'low_stock'
  >('products');

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<StockFilterType>('all');

  // Modals state
  const [isAddProductOpen, setIsAddProductOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState<boolean>(false);

  // Stock In Form state
  const [stockInProductId, setStockInProductId] = useState<string>('');
  const [stockInQty, setStockInQty] = useState<string>('10');
  const [stockInCost, setStockInCost] = useState<string>('');
  const [stockInNotes, setStockInNotes] = useState<string>('');
  const [isSubmittingStockIn, setIsSubmittingStockIn] = useState<boolean>(false);
  const [stockInFeedback, setStockInFeedback] = useState<string | null>(null);

  // Stock Adjustment Form
  const [adjType, setAdjType] = useState<InventoryMovementType>('RESTOCK');
  const [adjQty, setAdjQty] = useState<string>('10');
  const [adjNotes, setAdjNotes] = useState<string>('');
  const [isSubmittingAdj, setIsSubmittingAdj] = useState<boolean>(false);

  // New Product Form
  const [newProdName, setNewProdName] = useState('');
  const [newProdCategoryId, setNewProdCategoryId] = useState('');
  const [newProdSku, setNewProdSku] = useState('');
  const [newProdBarcode, setNewProdBarcode] = useState('');
  const [newProdCostPrice, setNewProdCostPrice] = useState('1000');
  const [newProdSellingPrice, setNewProdSellingPrice] = useState('1500');
  const [newProdTaxRate, setNewProdTaxRate] = useState('18');
  const [newProdUnit, setNewProdUnit] = useState('pcs');
  const [newProdStock, setNewProdStock] = useState('20');
  const [newProdMinStock, setNewProdMinStock] = useState('5');
  const [newProdDesc, setNewProdDesc] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // New Category Form
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#0284c7');
  const [newCatIcon] = useState('package');
  const [catFormError, setCatFormError] = useState<string | null>(null);

  // Sync state
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [allProducts, allCategories, allMovements] = await Promise.all([
      productRepository.getAll(),
      categoryRepository.getAllActive(),
      inventoryRepository.getRecentMovements(100),
    ]);
    setProducts(allProducts);
    setCategories(allCategories);
    setMovements(allMovements);

    setNewProdCategoryId(prev => prev || (allCategories.length > 0 ? allCategories[0].id : ''));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return products.filter(p => {
      if (selectedCategoryId !== 'all' && p.category_id !== selectedCategoryId) {
        return false;
      }
      if (stockFilter === 'out_of_stock' && p.stock_quantity > 0) {
        return false;
      }
      if (stockFilter === 'low_stock' && (p.stock_quantity <= 0 || p.stock_quantity > p.min_stock_level)) {
        return false;
      }
      if (stockFilter === 'in_stock' && p.stock_quantity <= p.min_stock_level) {
        return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        Boolean(p.description && p.description.toLowerCase().includes(q))
      );
    });
  }, [products, searchQuery, selectedCategoryId, stockFilter]);

  // Counts
  const lowStockCount = useMemo(() => {
    return products.filter(p => p.is_active && p.stock_quantity > 0 && p.stock_quantity <= p.min_stock_level).length;
  }, [products]);

  const outOfStockCount = useMemo(() => {
    return products.filter(p => p.is_active && p.stock_quantity <= 0).length;
  }, [products]);

  // Stock Adjustment Execution
  const handleExecuteAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingProduct || !activeRegister || !currentUser) return;

    const qty = parseInt(adjQty, 10);
    if (isNaN(qty) || qty === 0) return;

    let delta = qty;
    if (adjType === 'DAMAGE' || adjType === 'SALE') {
      delta = -Math.abs(qty);
    } else {
      delta = Math.abs(qty);
    }

    setIsSubmittingAdj(true);
    try {
      await inventoryService.adjustStock(
        adjustingProduct.id,
        delta,
        adjType,
        activeRegister.id,
        currentUser.id,
        adjNotes
      );
      await loadData();
      setAdjustingProduct(null);
      setAdjNotes('');
    } catch (e: any) {
      alert(e.message || 'Error adjusting stock');
    } finally {
      setIsSubmittingAdj(false);
    }
  };

  // Open Add Product Modal with generated defaults
  const handleOpenAddProduct = () => {
    setFormError(null);
    setNewProdName('');
    setNewProdSku(productRepository.generateSKU('ITEM'));
    setNewProdBarcode(productRepository.generateBarcode());
    setNewProdCostPrice('1000');
    setNewProdSellingPrice('1500');
    setNewProdTaxRate('18');
    setNewProdUnit('pcs');
    setNewProdStock('25');
    setNewProdMinStock('5');
    setNewProdDesc('');
    if (categories.length > 0) {
      setNewProdCategoryId(categories[0].id);
    }
    setIsAddProductOpen(true);
  };

  // Save New Product
  const handleSaveNewProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const costPrice = parseInt(newProdCostPrice, 10);
    const sellingPrice = parseInt(newProdSellingPrice, 10);
    const stock = parseInt(newProdStock, 10);
    const minStock = parseInt(newProdMinStock, 10);
    const taxRate = parseFloat(newProdTaxRate);

    if (!newProdName.trim()) {
      setFormError('Product name is required');
      return;
    }
    if (!newProdCategoryId) {
      setFormError('Please select a category');
      return;
    }
    if (isNaN(costPrice) || costPrice < 0 || isNaN(sellingPrice) || sellingPrice < 0) {
      setFormError('Cost and Selling price must be valid non-negative numbers');
      return;
    }

    try {
      await productRepository.createProduct(
        {
          name: newProdName,
          category_id: newProdCategoryId,
          sku: newProdSku,
          barcode: newProdBarcode,
          cost_price: costPrice,
          selling_price: sellingPrice,
          tax_rate: isNaN(taxRate) ? 18 : taxRate,
          unit: newProdUnit,
          stock_quantity: isNaN(stock) ? 0 : stock,
          min_stock_level: isNaN(minStock) ? 5 : minStock,
          description: newProdDesc,
        },
        {
          userId: currentUser?.id,
          registerId: activeRegister?.id,
        }
      );

      await loadData();
      setIsAddProductOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Error creating product');
    }
  };

  // Save Edited Product
  const handleSaveEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setFormError(null);

    try {
      await productRepository.updateProduct(editingProduct.id, {
        name: editingProduct.name,
        category_id: editingProduct.category_id,
        sku: editingProduct.sku,
        barcode: editingProduct.barcode,
        cost_price: editingProduct.cost_price,
        selling_price: editingProduct.selling_price,
        tax_rate: editingProduct.tax_rate,
        unit: editingProduct.unit,
        min_stock_level: editingProduct.min_stock_level,
        description: editingProduct.description,
        is_active: editingProduct.is_active,
      });

      await loadData();
      setEditingProduct(null);
    } catch (err: any) {
      setFormError(err.message || 'Error updating product');
    }
  };

  // Save New Category
  const handleSaveNewCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCatFormError(null);

    if (!newCatName.trim()) {
      setCatFormError('Category name is required');
      return;
    }

    try {
      await categoryRepository.createCategory({
        name: newCatName.trim(),
        color: newCatColor,
        icon: newCatIcon,
      });

      await loadData();
      setIsAddCategoryOpen(false);
      setNewCatName('');
    } catch (err: any) {
      setCatFormError(err.message || 'Error creating category');
    }
  };

  // Bidirectional Catalog Sync
  const handleSyncCatalog = async () => {
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const result = await syncService.syncCatalog();
      setSyncFeedback(
        `Sync completed: Pushed ${result.pushed} pending items. Remote catalog pull: ${
          result.pulled ? 'Success' : 'Offline / Skipped'
        }`
      );
      await loadData();
    } catch (err: any) {
      setSyncFeedback(`Sync failed: ${err.message || String(err)}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Margin calculation preview for new product modal
  const newProdMargin = useMemo(() => {
    const cost = parseInt(newProdCostPrice, 10) || 0;
    const sell = parseInt(newProdSellingPrice, 10) || 0;
    return productRepository.calculateMargin(cost, sell);
  }, [newProdCostPrice, newProdSellingPrice]);

  // Real-time Stock Valuation
  const stockValuation = useMemo(() => {
    let totalUnits = 0;
    let totalCostVal = 0;
    let totalRetailVal = 0;
    for (const p of products) {
      totalUnits += p.stock_quantity;
      totalCostVal += p.stock_quantity * p.cost_price;
      totalRetailVal += p.stock_quantity * p.selling_price;
    }
    const projectedProfit = totalRetailVal - totalCostVal;
    return { totalUnits, totalCostVal, totalRetailVal, projectedProfit };
  }, [products]);

  // Handle Stock In Submit
  const handleStockInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStockInFeedback(null);
    if (!stockInProductId) {
      setStockInFeedback('Please select a product for stock in');
      return;
    }
    const targetProduct = products.find(p => p.id === stockInProductId);
    if (!targetProduct) return;

    const qty = parseInt(stockInQty, 10);
    if (isNaN(qty) || qty <= 0) {
      setStockInFeedback('Quantity must be a positive integer');
      return;
    }

    setIsSubmittingStockIn(true);
    try {
      await inventoryRepository.adjustStock(
        targetProduct.id,
        qty,
        'RESTOCK',
        activeRegister?.id || 'reg-01',
        currentUser?.id || 'cashier',
        stockInNotes.trim() ? `Stock In: ${stockInNotes.trim()}` : 'Purchase Receipt / Restock'
      );

      await loadData();
      setStockInFeedback(
        `Successfully received +${qty} ${targetProduct.unit} for "${targetProduct.name}". New Stock: ${
          targetProduct.stock_quantity + qty
        }`
      );
      setStockInQty('10');
      setStockInNotes('');
    } catch (err: any) {
      setStockInFeedback(`Failed to record stock in: ${err.message || String(err)}`);
    } finally {
      setIsSubmittingStockIn(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Package className="w-5 h-5 text-sky-400" />
            <span>PRODUCTS &amp; INVENTORY LEDGER</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            SKUs, Barcodes, Cost/Selling Prices, Min Stock Thresholds &bull; Bidirectional Sync with Supabase
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Add Product Button */}
          <button
            onClick={handleOpenAddProduct}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-sky-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>New Product</span>
          </button>

          {/* Sync Catalog Button */}
          <button
            onClick={handleSyncCatalog}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold rounded-xl text-xs transition disabled:opacity-50"
            title="Sync products and stock movements bidirectionally with Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-sky-400' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Catalog'}</span>
          </button>
        </div>
      </div>

      {/* Sync Feedback Message */}
      {syncFeedback && (
        <div className="p-3 bg-sky-950/80 border border-sky-800 text-sky-300 text-xs rounded-xl flex items-center justify-between">
          <span>{syncFeedback}</span>
          <button onClick={() => setSyncFeedback(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs Bar */}
      {/* Tabs Bar matching authoritative hierarchy */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-2">
        <div className="flex gap-1.5 flex-wrap">
          {/* 1. Products */}
          <button
            onClick={() => {
              setActiveTab('products');
              setStockFilter('all');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${
              activeTab === 'products'
                ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            Products ({products.length})
          </button>

          {/* 2. Categories */}
          <button
            onClick={() => setActiveTab('categories')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${
              activeTab === 'categories'
                ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            Categories ({categories.length})
          </button>

          {/* 3. Stock */}
          <button
            onClick={() => setActiveTab('stock')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${
              activeTab === 'stock'
                ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            Stock
          </button>

          {/* 4. Stock In */}
          <button
            onClick={() => {
              setActiveTab('stock_in');
              if (!stockInProductId && products.length > 0) {
                setStockInProductId(products[0].id);
                setStockInCost(String(products[0].cost_price));
              }
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${
              activeTab === 'stock_in'
                ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            Stock In
          </button>

          {/* 5. Adjustments */}
          <button
            onClick={() => setActiveTab('adjustments')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${
              activeTab === 'adjustments'
                ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            Adjustments ({movements.length})
          </button>

          {/* 6. Low Stock */}
          <button
            onClick={() => {
              setActiveTab('low_stock');
              setStockFilter('low_stock');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border flex items-center gap-1.5 ${
              activeTab === 'low_stock'
                ? 'bg-amber-600 border-amber-500 text-white shadow-sm'
                : 'bg-slate-900 border-slate-800 text-amber-400 hover:bg-slate-800 hover:text-amber-300'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Low Stock ({lowStockCount})</span>
          </button>
        </div>

        {/* Stock Status Pills (when on products tab) */}
        {activeTab === 'products' && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setStockFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                stockFilter === 'all'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStockFilter('low_stock')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                stockFilter === 'low_stock'
                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                  : 'text-amber-400/80 hover:text-amber-300'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Low Stock ({lowStockCount})</span>
            </button>
            <button
              onClick={() => setStockFilter('out_of_stock')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                stockFilter === 'out_of_stock'
                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                  : 'text-rose-400/80 hover:text-rose-300'
              }`}
            >
              <span>Out of Stock ({outOfStockCount})</span>
            </button>
          </div>
        )}
      </div>

      {/* TAB 1: PRODUCT CATALOG & LOW STOCK */}
      {(activeTab === 'products' || activeTab === 'low_stock') && (
        <div className="space-y-4">
          {/* Search & Category Filter bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search products by Name, SKU, Barcode, or Description..."
                className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <select
              value={selectedCategoryId}
              onChange={e => setSelectedCategoryId(e.target.value)}
              className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
            >
              <option value="all">All Categories</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Products Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="grid grid-cols-12 p-3 bg-slate-950/80 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <span className="col-span-4">Product Details</span>
              <span className="col-span-2">SKU &amp; Barcode</span>
              <span className="col-span-2">Price &amp; Margin</span>
              <span className="col-span-2">Stock Level</span>
              <span className="col-span-2 text-right">Actions</span>
            </div>

            <div className="divide-y divide-slate-800/80">
              {products.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  <Package className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                  <p className="font-bold text-sm text-slate-300">No products in inventory yet</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Click &quot;+ New Product&quot; above to add your first product to the catalog.
                  </p>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="p-10 text-center text-slate-500 text-xs">
                  No products match your search or filter criteria.
                </div>
              ) : (
                filteredProducts.map(prod => {
                  const categoryName = categories.find(c => c.id === prod.category_id)?.name || 'Uncategorized';
                  const margin = productRepository.calculateMargin(prod.cost_price, prod.selling_price);
                  const isOutOfStock = prod.stock_quantity <= 0;
                  const isLowStock = !isOutOfStock && prod.stock_quantity <= prod.min_stock_level;

                  return (
                    <div
                      key={prod.id}
                      className="grid grid-cols-12 p-3.5 bg-slate-900/40 hover:bg-slate-850 items-center text-xs transition"
                    >
                      {/* Product Details */}
                      <div className="col-span-4 pr-2">
                        <span className="font-bold text-slate-100 block text-sm">{prod.name}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded font-medium">
                            {categoryName}
                          </span>
                          <span className="text-[11px] text-slate-500">Unit: {prod.unit}</span>
                          {!prod.is_active && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-rose-950 text-rose-400 rounded font-bold">
                              Inactive
                            </span>
                          )}
                        </div>
                      </div>

                      {/* SKU & Barcode */}
                      <div className="col-span-2 font-mono text-[11px] space-y-0.5">
                        <div className="flex items-center gap-1 text-slate-300">
                          <Tag className="w-3 h-3 text-slate-500" />
                          <span>{prod.sku}</span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-500 text-[10px]">
                          <Barcode className="w-3 h-3" />
                          <span>{prod.barcode}</span>
                        </div>
                      </div>

                      {/* Price & Margin */}
                      <div className="col-span-2 space-y-0.5">
                        <span className="text-white font-bold block">{formatMoney(prod.selling_price)}</span>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                          <span>Cost: {formatMoney(prod.cost_price)}</span>
                          <span className="text-emerald-400 font-semibold">{margin}%</span>
                        </div>
                      </div>

                      {/* Stock Level */}
                      <div className="col-span-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                            isOutOfStock
                              ? 'bg-rose-950 text-rose-400 border border-rose-800'
                              : isLowStock
                              ? 'bg-amber-950 text-amber-400 border border-amber-800'
                              : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          }`}
                        >
                          {isOutOfStock && <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />}
                          {isLowStock && <AlertTriangle className="w-3 h-3" />}
                          {!isOutOfStock && !isLowStock && <Check className="w-3 h-3" />}
                          <span>{prod.stock_quantity} {prod.unit}</span>
                        </span>
                        <span className="block text-[10px] text-slate-500 mt-1">
                          Min Level: {prod.min_stock_level} {prod.unit}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="col-span-2 flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setAdjustingProduct(prod);
                            setAdjQty('10');
                            setAdjNotes('');
                          }}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-sky-600 hover:text-white text-sky-400 font-semibold rounded-lg text-xs transition border border-slate-700"
                          title="Adjust or Restock this item"
                        >
                          Adjust
                        </button>
                        <button
                          onClick={() => setEditingProduct({ ...prod })}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition border border-slate-700"
                          title="Edit product details"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CATEGORIES MANAGEMENT */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-white">Product Categories ({categories.length})</h3>
            <button
              onClick={() => {
                setCatFormError(null);
                setNewCatName('');
                setIsAddCategoryOpen(true);
              }}
              className="flex items-center gap-1 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Category</span>
            </button>
          </div>

          {categories.length === 0 ? (
            <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl text-slate-400">
              <Tag className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="font-bold text-sm text-slate-300">No product categories yet</p>
              <p className="text-xs text-slate-500 mt-1">
                Click &quot;Add Category&quot; above to organize your catalog into departments.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {categories.map(cat => {
                const count = products.filter(p => p.category_id === cat.id).length;
                return (
                  <div
                    key={cat.id}
                    className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between shadow-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
                        style={{ backgroundColor: cat.color || '#0284c7' }}
                      >
                        <Tag className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-sm">{cat.name}</h4>
                        <p className="text-[11px] text-slate-500 font-mono">Slug: {cat.slug}</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 bg-slate-800 text-slate-300 rounded-lg text-xs font-bold">
                      {count} products
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ADJUSTMENTS & MOVEMENT HISTORY */}
      {activeTab === 'adjustments' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 bg-slate-950/70 border-b border-slate-800 text-xs font-bold text-slate-400 uppercase tracking-wider flex justify-between items-center">
            <span>Immutable Stock Movement Ledger</span>
            <span className="text-[10px] text-slate-500">Showing last {movements.length} entries</span>
          </div>

          <div className="divide-y divide-slate-800/80 max-h-[500px] overflow-y-auto">
            {movements.length === 0 ? (
              <div className="p-10 text-center text-slate-500 text-xs">
                No stock movements recorded yet. Stock adjustments and sales movements will be logged here.
              </div>
            ) : (
              movements.map(m => {
              const prod = products.find(p => p.id === m.product_id);
              return (
                <div key={m.id} className="p-3 bg-slate-950/40 flex items-center justify-between text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                          m.type === 'SALE'
                            ? 'bg-sky-950 text-sky-400'
                            : m.type === 'DAMAGE'
                            ? 'bg-rose-950 text-rose-400'
                            : 'bg-emerald-950 text-emerald-400'
                        }`}
                      >
                        {m.type}
                      </span>
                      <span className="font-bold text-slate-200">
                        {prod ? prod.name : m.product_id.slice(0, 8)}: Delta {m.quantity_delta > 0 ? `+${m.quantity_delta}` : m.quantity_delta}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      Before: {m.previous_quantity} &rarr; After: {m.new_quantity} &bull; {m.notes || 'No notes'}
                    </span>
                  </div>

                  <div className="text-right text-[10px] text-slate-500 font-mono">
                    <span>{new Date(m.timestamp).toLocaleString()}</span>
                    <span className="block text-slate-600">Key: {m.idempotency_key}</span>
                  </div>
                </div>
              );
            }))}
          </div>
        </div>
      )}

      {/* TAB 4: STOCK VALUATION & REAL-TIME INVENTORY */}
      {activeTab === 'stock' && (
        <div className="space-y-6">
          {/* 4 Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 block">Total Units In Stock</span>
              <span className="text-2xl font-black text-white mt-1 block">
                {stockValuation.totalUnits.toLocaleString()} units
              </span>
              <span className="text-[11px] text-slate-500 mt-1 block">Across {products.length} SKUs</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 block">Inventory Cost Value</span>
              <span className="text-2xl font-black text-sky-400 mt-1 block">
                {formatMoney(stockValuation.totalCostVal)}
              </span>
              <span className="text-[11px] text-slate-500 mt-1 block">Purchase value at cost</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 block">Total Retail Valuation</span>
              <span className="text-2xl font-black text-emerald-400 mt-1 block">
                {formatMoney(stockValuation.totalRetailVal)}
              </span>
              <span className="text-[11px] text-slate-500 mt-1 block">Expected revenue at retail</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 block">Projected Gross Profit</span>
              <span className="text-2xl font-black text-amber-400 mt-1 block">
                {formatMoney(stockValuation.projectedProfit)}
              </span>
              <span className="text-[11px] text-slate-500 mt-1 block">
                {stockValuation.totalRetailVal > 0
                  ? `${Math.round((stockValuation.projectedProfit / stockValuation.totalRetailVal) * 100)}% overall margin`
                  : '0% overall margin'}
              </span>
            </div>
          </div>

          {/* Detailed Stock Ledger Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-wider">
              <span>Current Stock Levels by Product</span>
              <span className="text-[10px] text-slate-500">{products.length} registered products</span>
            </div>
            <div className="divide-y divide-slate-800/80 max-h-[500px] overflow-y-auto">
              {products.map(prod => {
                const isOut = prod.stock_quantity <= 0;
                const isLow = prod.stock_quantity > 0 && prod.stock_quantity <= prod.min_stock_level;
                const costVal = prod.stock_quantity * prod.cost_price;
                const retailVal = prod.stock_quantity * prod.selling_price;
                return (
                  <div key={prod.id} className="p-4 flex items-center justify-between hover:bg-slate-800/30 transition text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{prod.name}</span>
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          {prod.sku}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
                        <span>Cost: {formatMoney(prod.cost_price)}</span>
                        <span>Retail: {formatMoney(prod.selling_price)}</span>
                        <span>Min Threshold: {prod.min_stock_level} {prod.unit}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                          isOut
                            ? 'bg-rose-950 text-rose-400 border border-rose-800'
                            : isLow
                            ? 'bg-amber-950 text-amber-400 border border-amber-800'
                            : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        }`}
                      >
                        {prod.stock_quantity} {prod.unit}
                      </span>
                      <div className="text-[10px] text-slate-400 mt-1 font-mono">
                        Val: {formatMoney(costVal)} / {formatMoney(retailVal)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: STOCK IN / PURCHASE RESTOCK */}
      {activeTab === 'stock_in' && (
        <div className="max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              <span>Receive Inventory / Stock In</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Record incoming purchase orders or fresh deliveries directly into local inventory.
            </p>
          </div>

          {stockInFeedback && (
            <div
              className={`p-3 rounded-xl text-xs border ${
                stockInFeedback.includes('Successfully')
                  ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
                  : 'bg-rose-950/80 border-rose-800 text-rose-300'
              }`}
            >
              {stockInFeedback}
            </div>
          )}

          <form onSubmit={handleStockInSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Select Product *</label>
              <select
                value={stockInProductId}
                onChange={e => {
                  setStockInProductId(e.target.value);
                  const p = products.find(x => x.id === e.target.value);
                  if (p) setStockInCost(String(p.cost_price));
                }}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
              >
                <option value="">-- Choose Product --</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} (SKU: {p.sku}) &bull; Current: {p.stock_quantity} {p.unit}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Quantity to Receive *</label>
                <input
                  type="number"
                  min="1"
                  value={stockInQty}
                  onChange={e => setStockInQty(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Unit Cost Price (Cents)</label>
                <input
                  type="number"
                  min="0"
                  value={stockInCost}
                  onChange={e => setStockInCost(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
                  placeholder="Defaults to current cost"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Supplier / PO Reference / Note</label>
              <input
                type="text"
                value={stockInNotes}
                onChange={e => setStockInNotes(e.target.value)}
                placeholder="e.g., Invoice #INV-8821 from Apex Supplies"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmittingStockIn || !stockInProductId}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>{isSubmittingStockIn ? 'Recording Movement...' : 'Confirm & Commit Stock In'}</span>
            </button>
          </form>
        </div>
      )}

      {/* MODAL: ADD PRODUCT */}
      {isAddProductOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl my-8">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-sky-400" />
                <span>Create New Product</span>
              </h3>
              <button
                onClick={() => setIsAddProductOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs rounded-xl">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveNewProduct} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  value={newProdName}
                  onChange={e => setNewProdName(e.target.value)}
                  placeholder="e.g. Arabica Coffee Beans 250g"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Category *</label>
                  <select
                    value={newProdCategoryId}
                    onChange={e => setNewProdCategoryId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Unit</label>
                  <input
                    type="text"
                    value={newProdUnit}
                    onChange={e => setNewProdUnit(e.target.value)}
                    placeholder="pcs, kg, box..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-slate-300 uppercase">SKU *</label>
                    <button
                      type="button"
                      onClick={() => setNewProdSku(productRepository.generateSKU('ITEM'))}
                      className="text-[10px] text-sky-400 hover:underline"
                    >
                      Generate
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={newProdSku}
                    onChange={e => setNewProdSku(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-slate-300 uppercase">Barcode *</label>
                    <button
                      type="button"
                      onClick={() => setNewProdBarcode(productRepository.generateBarcode())}
                      className="text-[10px] text-sky-400 hover:underline"
                    >
                      Generate
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={newProdBarcode}
                    onChange={e => setNewProdBarcode(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Cost Price (Minor Units) *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={newProdCostPrice}
                    onChange={e => setNewProdCostPrice(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Selling Price *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={newProdSellingPrice}
                    onChange={e => setNewProdSellingPrice(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Gross Margin %</label>
                  <div className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-bold text-emerald-400 font-mono flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>{newProdMargin}%</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Tax Rate (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={newProdTaxRate}
                    onChange={e => setNewProdTaxRate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Initial Stock</label>
                  <input
                    type="number"
                    min="0"
                    value={newProdStock}
                    onChange={e => setNewProdStock(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Min Stock Alert Level</label>
                  <input
                    type="number"
                    min="0"
                    value={newProdMinStock}
                    onChange={e => setNewProdMinStock(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={newProdDesc}
                  onChange={e => setNewProdDesc(e.target.value)}
                  placeholder="Optional notes or specification..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddProductOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-sky-600/30"
                >
                  Create &amp; Enqueue Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT PRODUCT */}
      {editingProduct && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl my-8">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-sky-400" />
                <span>Edit Product: {editingProduct.name}</span>
              </h3>
              <button
                onClick={() => setEditingProduct(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs rounded-xl">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveEditProduct} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  value={editingProduct.name}
                  onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Category</label>
                  <select
                    value={editingProduct.category_id}
                    onChange={e => setEditingProduct({ ...editingProduct, category_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Unit</label>
                  <input
                    type="text"
                    value={editingProduct.unit}
                    onChange={e => setEditingProduct({ ...editingProduct, unit: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">SKU</label>
                  <input
                    type="text"
                    value={editingProduct.sku}
                    onChange={e => setEditingProduct({ ...editingProduct, sku: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Barcode</label>
                  <input
                    type="text"
                    value={editingProduct.barcode}
                    onChange={e => setEditingProduct({ ...editingProduct, barcode: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Cost Price *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={editingProduct.cost_price}
                    onChange={e => setEditingProduct({ ...editingProduct, cost_price: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Selling Price *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={editingProduct.selling_price}
                    onChange={e => setEditingProduct({ ...editingProduct, selling_price: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Min Stock Level</label>
                  <input
                    type="number"
                    min="0"
                    value={editingProduct.min_stock_level}
                    onChange={e => setEditingProduct({ ...editingProduct, min_stock_level: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-sky-600/30"
                >
                  Update Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: STOCK ADJUSTMENT */}
      {adjustingProduct && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Adjust Stock Level</h3>
                <p className="text-xs text-slate-400">{adjustingProduct.name} ({adjustingProduct.sku})</p>
              </div>
              <button
                onClick={() => setAdjustingProduct(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
              <span className="text-slate-400">Current Stock:</span>
              <span className="font-bold text-white font-mono text-sm">{adjustingProduct.stock_quantity} {adjustingProduct.unit}</span>
            </div>

            <form onSubmit={handleExecuteAdjustment} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Adjustment Type *</label>
                <select
                  value={adjType}
                  onChange={e => setAdjType(e.target.value as InventoryMovementType)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                >
                  <option value="RESTOCK">Stock In / Restock (+)</option>
                  <option value="DAMAGE">Damaged Stock (-)</option>
                  <option value="RETURN">Customer Return (+)</option>
                  <option value="ADJUSTMENT">Stock Audit Adjustment (+/-)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Quantity ({adjustingProduct.unit}) *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={adjQty}
                  onChange={e => setAdjQty(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Reason / Notes</label>
                <input
                  type="text"
                  value={adjNotes}
                  onChange={e => setAdjNotes(e.target.value)}
                  placeholder="e.g. Delivery from Supplier PO-908"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustingProduct(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdj}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-sky-600/30"
                >
                  {isSubmittingAdj ? 'Recording Movement...' : 'Save & Update Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD CATEGORY */}
      {isAddCategoryOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Tag className="w-5 h-5 text-sky-400" />
                <span>Create New Category</span>
              </h3>
              <button
                onClick={() => setIsAddCategoryOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {catFormError && (
              <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs rounded-xl">
                {catFormError}
              </div>
            )}

            <form onSubmit={handleSaveNewCategory} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Category Name *</label>
                <input
                  type="text"
                  required
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  placeholder="e.g. Health & Nutrition"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Theme Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={newCatColor}
                    onChange={e => setNewCatColor(e.target.value)}
                    className="w-10 h-10 rounded-lg cursor-pointer bg-slate-950 border border-slate-700"
                  />
                  <span className="text-xs text-slate-400 font-mono">{newCatColor}</span>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddCategoryOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-sky-600/30"
                >
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
