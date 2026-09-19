import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Barcode,
  Package,
  Plus,
  AlertCircle,
  Tag,
  CheckCircle,
  ArrowRight,
  Filter,
  Layers,
} from 'lucide-react';
import { db } from '../../db';
import { Product, Category } from '../../types';
import { formatMoney } from '../../utils/money';
import { usePos } from '../../store/posStore';
import { useBarcodeScanner } from '../../services/barcodeService';

interface ProductCatalogProps {
  onProceedToReviewCart: () => void;
}

export const ProductCatalog: React.FC<ProductCatalogProps> = ({ onProceedToReviewCart }) => {
  const {
    addToCart,
    cartItems,
    setStockAlertOpen,
    setProductNotFoundOpen,
    setActiveWorkflowStep,
  } = usePos();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [lastScannedBarcode, setLastScannedBarcode] = useState<string>('');
  const [recentlyAddedProduct, setRecentlyAddedProduct] = useState<Product | null>(null);
  const [showMoreProductsPrompt, setShowMoreProductsPrompt] = useState<boolean>(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCatalog();
  }, []);

  const loadCatalog = async () => {
    const [allProducts, allCategories] = await Promise.all([
      db.products.where('is_active').equals(1).toArray(),
      db.categories.toArray(),
    ]);
    setProducts(allProducts);
    setCategories(allCategories);
  };

  /**
   * Hardware Barcode Scanner Listener
   */
  useBarcodeScanner({
    onScan: (scannedBarcode: string) => {
      handleBarcodeScanned(scannedBarcode);
    },
  });

  /**
   * Authoritative Step 5 & 6 & 7: Scan Product -> Check Stock -> Add to Cart
   */
  const handleBarcodeScanned = async (barcode: string) => {
    setLastScannedBarcode(barcode);

    // Search by exact barcode or SKU first
    const matchedProduct = await db.products
      .where('barcode')
      .equals(barcode)
      .or('sku')
      .equals(barcode)
      .first();

    if (!matchedProduct) {
      // Step 5 Decision: Product NOT Found
      setProductNotFoundOpen(true, barcode);
      return;
    }

    // Step 6: Check Stock
    if (matchedProduct.stock_quantity <= 0) {
      // Step 6 Decision: Out of stock
      setStockAlertOpen(
        true,
        `OUT OF STOCK: "${matchedProduct.name}" (SKU: ${matchedProduct.sku}) has 0 units available.`
      );
      return;
    }

    // Step 7: Add to Cart
    const success = addToCart(matchedProduct, 1);
    if (success) {
      setRecentlyAddedProduct(matchedProduct);
      setShowMoreProductsPrompt(true);
      setActiveWorkflowStep(7);
    }
  };

  const handleManualSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    // Check if query is a barcode or SKU
    const exactMatch = products.find(
      p => p.barcode.toLowerCase() === query.toLowerCase() || p.sku.toLowerCase() === query.toLowerCase()
    );

    if (exactMatch) {
      handleProductSelect(exactMatch);
      setSearchQuery('');
    } else {
      const partialMatches = filteredProducts;
      if (partialMatches.length === 1) {
        handleProductSelect(partialMatches[0]);
        setSearchQuery('');
      } else if (partialMatches.length === 0) {
        setProductNotFoundOpen(true, query);
      }
    }
  };

  /**
   * Authoritative Step 6: CHECK STOCK when product is clicked
   */
  const handleProductSelect = (product: Product) => {
    // Step 6 Decision: In Stock?
    if (product.stock_quantity <= 0) {
      setStockAlertOpen(
        true,
        `OUT OF STOCK: "${product.name}" (SKU: ${product.sku}) is currently out of stock. Stock: 0 ${product.unit}.`
      );
      return;
    }

    // Step 7: Add to Cart
    const success = addToCart(product, 1);
    if (success) {
      setRecentlyAddedProduct(product);
      setShowMoreProductsPrompt(true);
      setActiveWorkflowStep(7);
    }
  };

  // Filter products by category and search query
  const filteredProducts = products.filter(p => {
    const matchesCategory = selectedCategoryId === 'all' || p.category_id === selectedCategoryId;
    const q = searchQuery.toLowerCase().trim();
    const matchesQuery =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.barcode.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q));

    return matchesCategory && matchesQuery;
  });

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Top Bar: Barcode & Search Input (Step 5) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-3">
        <form onSubmit={handleManualSearchSubmit} className="relative">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                data-barcode-input="true"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Scan barcode, or search by product name, SKU, or code..."
                className="w-full pl-12 pr-28 py-3.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition shadow-inner font-medium"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg text-[10px] font-mono text-slate-400">
                <Barcode className="w-3.5 h-3.5 text-sky-400" />
                SCANNER READY
              </span>
            </div>

            <button
              type="submit"
              className="px-5 py-3.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-sky-600/30 flex items-center gap-2 shrink-0"
            >
              <Search className="w-4 h-4" />
              SEARCH (STEP 5)
            </button>
          </div>
        </form>

        {/* Category Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="text-slate-500 flex items-center gap-1 shrink-0 mr-1 text-[11px]">
            <Filter className="w-3 h-3" /> Filter:
          </span>
          <button
            onClick={() => setSelectedCategoryId('all')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition shrink-0 border ${
              selectedCategoryId === 'all'
                ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
                : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            All Products ({products.length})
          </button>
          {categories.map(cat => {
            const count = products.filter(p => p.category_id === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`px-3 py-1.5 rounded-xl font-semibold transition shrink-0 border ${
                  selectedCategoryId === cat.id
                    ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
                    : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                {cat.name} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Decision Modal: "MORE PRODUCTS?" Prompt from Diagram */}
      {showMoreProductsPrompt && recentlyAddedProduct && (
        <div className="p-4 bg-emerald-950/90 border border-emerald-700/80 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xl animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-bold">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-emerald-200 font-bold">
                Added &ldquo;{recentlyAddedProduct.name}&rdquo; to cart!
              </p>
              <p className="text-[11px] text-emerald-400/90">
                Authoritative Decision: Need additional products?
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* YES -> Return to Scan Next Item (Step 5) */}
            <button
              onClick={() => {
                setShowMoreProductsPrompt(false);
                searchInputRef.current?.focus();
              }}
              className="flex-1 sm:flex-initial px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-emerald-600/60 text-emerald-200 font-bold rounded-xl text-xs transition"
            >
              YES: Scan Next Item (Step 5)
            </button>

            {/* NO -> Continue to Review Cart (Step 8) */}
            <button
              onClick={() => {
                setShowMoreProductsPrompt(false);
                onProceedToReviewCart();
              }}
              className="flex-1 sm:flex-initial px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-1.5"
            >
              <span>NO: Review Cart (Step 8)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Product Grid (Step 5 & 6) */}
      <div className="flex-1 overflow-y-auto pr-1">
        {filteredProducts.length === 0 ? (
          <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl">
            <Package className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-slate-300">No products found</h4>
            <p className="text-xs text-slate-500 mt-1">
              Try searching with a different SKU, barcode, or category filter.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredProducts.map(product => {
              const inStock = product.stock_quantity > 0;
              const cartCount = cartItems.find(i => i.product.id === product.id)?.quantity || 0;

              return (
                <button
                  key={product.id}
                  onClick={() => handleProductSelect(product)}
                  className={`text-left p-3.5 rounded-2xl transition border flex flex-col justify-between group relative ${
                    inStock
                      ? 'bg-slate-900/90 border-slate-800 hover:border-sky-500 hover:bg-slate-850 shadow-md active:scale-98'
                      : 'bg-slate-950/60 border-rose-950/60 opacity-60 cursor-not-allowed'
                  }`}
                >
                  {cartCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-sky-500 text-slate-950 text-[10px] font-extrabold w-5 h-5 rounded-full flex items-center justify-center shadow-md">
                      {cartCount}
                    </span>
                  )}

                  <div>
                    <div className="flex justify-between items-start mb-1.5">
                      <span className="text-[10px] font-mono text-slate-500">{product.sku}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
                          inStock
                            ? product.stock_quantity <= product.min_stock_level
                              ? 'bg-amber-950 text-amber-400 border border-amber-800'
                              : 'bg-slate-950 text-emerald-400 border border-emerald-900'
                            : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}
                      >
                        {inStock ? `${product.stock_quantity} ${product.unit}` : 'OUT OF STOCK'}
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-slate-100 group-hover:text-sky-300 transition line-clamp-2">
                      {product.name}
                    </h4>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-800/80 flex justify-between items-center">
                    <span className="text-sm font-extrabold text-white font-mono">
                      {formatMoney(product.selling_price)}
                    </span>
                    <span
                      className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs transition ${
                        inStock
                          ? 'bg-slate-800 text-slate-300 group-hover:bg-sky-600 group-hover:text-white'
                          : 'bg-rose-950 text-rose-500'
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
