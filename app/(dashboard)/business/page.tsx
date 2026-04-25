'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ShoppingBag,
  Plus,
  Search,
  MoreVertical,
  Pencil,
  Trash2,
  X,
  Image as ImageIcon,
  Eye,
  EyeOff,
  FolderOpen,
  Package,
  DollarSign,
  ExternalLink,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { useActiveSession } from '@/hooks/use-active-session';
import type { Product, Collection } from '@/lib/types';

// ---- Inline utility components ----

function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 mx-4 flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg border border-wa-border dark:border-zinc-700 bg-wa-panel dark:bg-zinc-800 shadow-xl">
        <div className="flex items-center justify-between border-b border-wa-border dark:border-zinc-700 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-wa-text dark:text-zinc-100">{title}</h2>
            {description && (
              <p className="mt-1 text-sm text-wa-text-secondary dark:text-zinc-300">{description}</p>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-wa-hover dark:hover:bg-zinc-700">
            <X className="h-5 w-5 text-wa-text-muted dark:text-zinc-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  label?: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-wa-teal' : 'bg-gray-300 dark:bg-zinc-600'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5.5' : 'translate-x-0.5'
          }`}
        />
      </button>
      {label && <span className="text-sm text-wa-text dark:text-zinc-100">{label}</span>}
    </label>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 rounded-full bg-wa-bg dark:bg-zinc-800 p-4 text-wa-text-muted dark:text-zinc-500">{icon}</div>
      <h3 className="mb-2 text-lg font-semibold text-wa-text dark:text-zinc-100">{title}</h3>
      <p className="mb-6 max-w-sm text-sm text-wa-text-secondary dark:text-zinc-300">{description}</p>
      {action}
    </div>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || 'Search...'}
      prefix={<Search className="h-4 w-4" />}
      suffix={
        value ? (
          <button onClick={() => onChange('')} className="hover:text-wa-text dark:hover:text-zinc-100">
            <X className="h-4 w-4" />
          </button>
        ) : undefined
      }
    />
  );
}

function DropdownMenu({
  trigger,
  items,
}: {
  trigger: React.ReactNode;
  items: { label: string; icon?: React.ReactNode; onClick: () => void; danger?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <div onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>{trigger}</div>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 min-w-[150px] rounded-lg border border-wa-border dark:border-zinc-700 bg-wa-panel dark:bg-zinc-800 py-1 shadow-lg">
            {items.map((item, i) => (
              <button
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  item.onClick();
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-wa-hover dark:hover:bg-zinc-700 ${
                  item.danger ? 'text-wa-danger' : 'text-wa-text dark:text-zinc-100'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const CURRENCIES = [
  { value: 'XOF', label: 'FCFA (XOF)' },
  { value: 'XAF', label: 'FCFA (XAF)' },
  { value: 'USD', label: 'USD ($)' },
  { value: 'EUR', label: 'EUR (€)' },
  { value: 'GBP', label: 'GBP (£)' },
  { value: 'GNF', label: 'GNF' },
  { value: 'NGN', label: 'NGN (₦)' },
  { value: 'GHS', label: 'GHS (₵)' },
  { value: 'MAD', label: 'MAD' },
  { value: 'BRL', label: 'BRL (R$)' },
  { value: 'INR', label: 'INR (₹)' },
  { value: 'MXN', label: 'MXN' },
  { value: 'ARS', label: 'ARS' },
  { value: 'COP', label: 'COP' },
];

function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(price);
  } catch {
    return `${currency} ${price.toFixed(2)}`;
  }
}

export default function BusinessPage() {
  const activeSessionId = useActiveSession();
  const [activeTab, setActiveTab] = useState<'products' | 'collections'>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Product modal state
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productCurrency, setProductCurrency] = useState('XOF');
  const [productImageUrl, setProductImageUrl] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [productVisible, setProductVisible] = useState(true);
  const [savingProduct, setSavingProduct] = useState(false);

  // Collection modal state
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
  const [collectionName, setCollectionName] = useState('');
  const [collectionProducts, setCollectionProducts] = useState<string[]>([]);
  const [savingCollection, setSavingCollection] = useState(false);

  const fetchProducts = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      const res = await fetch(
        `/api/business/products?sessionId=${activeSessionId}`
      );
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setProducts(data.data);
      }
    } catch {
      // handle silently
    }
  }, [activeSessionId]);

  const fetchCollections = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      const res = await fetch(
        `/api/business/collections?sessionId=${activeSessionId}`
      );
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setCollections(data.data);
      }
    } catch {
      // handle silently
    }
  }, [activeSessionId]);

  useEffect(() => {
    if (!activeSessionId) return;

    setLoading(true);
    // First load attempt
    Promise.all([fetchProducts(), fetchCollections()]).finally(() => setLoading(false));

    // Keep retrying every 5s until products load (session may not be connected yet)
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/business/products?sessionId=${activeSessionId}`);
        const data = await res.json();
        if (data.success && data.data && data.data.length > 0) {
          setProducts(data.data);
          clearInterval(interval); // Stop retrying once products are loaded
        }
      } catch { /* ignore */ }
    }, 5000);

    // Stop after 60s max
    const timeout = setTimeout(() => clearInterval(interval), 60000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [activeSessionId, fetchProducts, fetchCollections]);

  // Product CRUD
  const openCreateProduct = () => {
    setEditingProduct(null);
    setProductName('');
    setProductDescription('');
    setProductPrice('');
    setProductCurrency('USD');
    setProductImageUrl('');
    setProductUrl('');
    setProductVisible(true);
    setShowProductModal(true);
  };

  const openEditProduct = (product: Product) => {
    setEditingProduct(product);
    setProductName(product.name);
    setProductDescription(product.description || '');
    setProductPrice(product.price.toString());
    setProductCurrency(product.currency);
    setProductImageUrl(product.imageUrl || '');
    setProductUrl(product.url || '');
    setProductVisible(product.isVisible);
    setShowProductModal(true);
  };

  const handleSaveProduct = async () => {
    if (!productName.trim() || !activeSessionId) return;
    setSavingProduct(true);
    const body = {
      sessionId: activeSessionId,
      name: productName,
      description: productDescription,
      price: parseFloat(productPrice) || 0,
      currency: productCurrency,
      imageUrl: productImageUrl,
      url: productUrl,
      isVisible: productVisible,
    };

    try {
      if (editingProduct) {
        const res = await fetch(
          `/api/business/products/${editingProduct.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        );
        const data = await res.json();
        if (data.success) {
          setShowProductModal(false);
          fetchProducts();
        }
      } else {
        const res = await fetch('/api/business/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.success) {
          // Add product to local list immediately
          if (data.data) {
            setProducts((prev) => [...prev, data.data]);
          }
          setShowProductModal(false);
          // Also refresh from WhatsApp after a delay to get full data
          setTimeout(() => fetchProducts(), 3000);
          setTimeout(() => fetchProducts(), 8000);
        } else {
          alert(data.error || 'Failed to create product');
        }
      }
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setSavingProduct(false);
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    if (!confirm(`Delete product "${product.name}"?`)) return;
    try {
      await fetch(`/api/business/products/${product.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId }),
      });
      fetchProducts();
    } catch {
      // handle silently
    }
  };

  const handleToggleVisibility = async (product: Product) => {
    try {
      await fetch(`/api/business/products/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          isVisible: !product.isVisible,
        }),
      });
      setProducts((prev) =>
        prev.map((p) =>
          p.id === product.id ? { ...p, isVisible: !p.isVisible } : p
        )
      );
    } catch {
      // handle silently
    }
  };

  // Collection CRUD
  const openCreateCollection = () => {
    setEditingCollection(null);
    setCollectionName('');
    setCollectionProducts([]);
    setShowCollectionModal(true);
  };

  const openEditCollection = (collection: Collection) => {
    setEditingCollection(collection);
    setCollectionName(collection.name);
    setCollectionProducts([...collection.productIds]);
    setShowCollectionModal(true);
  };

  const handleSaveCollection = async () => {
    if (!collectionName.trim() || !activeSessionId) return;
    setSavingCollection(true);
    const body = {
      sessionId: activeSessionId,
      name: collectionName,
      productIds: collectionProducts,
    };

    try {
      if (editingCollection) {
        const res = await fetch(
          `/api/business/collections/${editingCollection.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        );
        const data = await res.json();
        if (data.success) {
          setShowCollectionModal(false);
          fetchCollections();
        }
      } else {
        const res = await fetch('/api/business/collections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.success) {
          setShowCollectionModal(false);
          fetchCollections();
        }
      }
    } catch {
      // handle silently
    } finally {
      setSavingCollection(false);
    }
  };

  const handleDeleteCollection = async (collection: Collection) => {
    if (!confirm(`Delete collection "${collection.name}"?`)) return;
    try {
      await fetch(`/api/business/collections/${collection.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId }),
      });
      fetchCollections();
    } catch {
      // handle silently
    }
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredCollections = collections.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col -m-4 md:-m-6 lg:max-w-none bg-slate-50 dark:bg-zinc-900 min-h-[calc(100vh-2rem)] md:min-h-[calc(100vh-3rem)]">
      <header className="sticky top-0 z-20 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-700">
        <div className="flex items-center gap-3 px-5 h-14">
          <div className="flex items-baseline gap-2 shrink-0">
            <h1 className="text-base font-semibold tracking-tight text-slate-900 dark:text-zinc-100">Business</h1>
          </div>
          <div className="h-5 w-px bg-slate-200 dark:bg-zinc-700" />
          {/* Tab pills */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => { setActiveTab('products'); setSearch(''); }}
              className={`inline-flex items-center gap-1.5 rounded-md h-8 px-2.5 text-[13px] font-medium transition-colors ${
                activeTab === 'products'
                  ? 'bg-slate-900 dark:bg-zinc-700 text-white'
                  : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700'
              }`}
            >
              <Package className="h-3.5 w-3.5" />
              Products
              <span className={`rounded px-1 text-[10px] font-mono tabular-nums ${activeTab === 'products' ? 'bg-white/20 text-white' : 'text-slate-400 dark:text-zinc-500'}`}>
                {products.length}
              </span>
            </button>
            <button
              onClick={() => { setActiveTab('collections'); setSearch(''); }}
              className={`inline-flex items-center gap-1.5 rounded-md h-8 px-2.5 text-[13px] font-medium transition-colors ${
                activeTab === 'collections'
                  ? 'bg-slate-900 dark:bg-zinc-700 text-white'
                  : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700'
              }`}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Collections
              <span className={`rounded px-1 text-[10px] font-mono tabular-nums ${activeTab === 'collections' ? 'bg-white/20 text-white' : 'text-slate-400 dark:text-zinc-500'}`}>
                {collections.length}
              </span>
            </button>
          </div>
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-zinc-500 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={activeTab === 'products' ? 'Search products…' : 'Search collections…'}
              className="w-full rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 pl-8 pr-3 h-8 text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-slate-400 dark:focus:border-zinc-500 focus:ring-2 focus:ring-slate-100 dark:focus:ring-zinc-700 transition"
            />
          </div>
          <button
            onClick={activeTab === 'products' ? openCreateProduct : openCreateCollection}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-slate-900 dark:bg-zinc-700 h-8 px-3 text-[13px] font-medium text-white hover:bg-slate-800 dark:hover:bg-zinc-600 active:scale-[0.98] transition-all"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{activeTab === 'products' ? 'Add product' : 'Add collection'}</span>
          </button>
        </div>
      </header>

      <div className="p-5">

      {/* Products Tab */}
      {activeTab === 'products' && (
        <>
          {filteredProducts.length === 0 ? (
            <EmptyState
              icon={<ShoppingBag className="h-10 w-10" />}
              title="No products found"
              description={
                search
                  ? 'No products match your search.'
                  : 'Add your first product to start building your catalog.'
              }
              action={
                !search ? (
                  <Button
                    icon={<Plus className="h-4 w-4" />}
                    onClick={openCreateProduct}
                  >
                    Add Product
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredProducts.map((product) => (
                <Card
                  key={product.id}
                  className="overflow-hidden transition-shadow hover:shadow-md dark:bg-zinc-800 dark:border-zinc-700"
                >
                  {/* Product Image */}
                  <div className="relative aspect-square bg-gray-100 dark:bg-zinc-700">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          (
                            e.target as HTMLImageElement
                          ).parentElement!.classList.add(
                            'flex',
                            'items-center',
                            'justify-center'
                          );
                          const icon = document.createElement('div');
                          icon.innerHTML = '';
                          (e.target as HTMLImageElement).parentElement!.innerHTML =
                            '<div class="text-gray-300"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg></div>';
                        }}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <ImageIcon className="h-12 w-12 text-gray-300 dark:text-zinc-600" />
                      </div>
                    )}
                    {!product.isVisible && (
                      <div className="absolute left-2 top-2">
                        <Badge variant="default">
                          <EyeOff className="mr-1 h-3 w-3" />
                          Hidden
                        </Badge>
                      </div>
                    )}
                    <div className="absolute right-2 top-2">
                      <DropdownMenu
                        trigger={
                          <button className="rounded-full bg-white/90 dark:bg-zinc-800/90 p-1.5 shadow hover:bg-white dark:hover:bg-zinc-700">
                            <MoreVertical className="h-4 w-4 text-wa-text-muted dark:text-zinc-400" />
                          </button>
                        }
                        items={[
                          {
                            label: 'Edit',
                            icon: <Pencil className="h-4 w-4" />,
                            onClick: () => openEditProduct(product),
                          },
                          {
                            label: product.isVisible ? 'Hide' : 'Show',
                            icon: product.isVisible ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            ),
                            onClick: () => handleToggleVisibility(product),
                          },
                          {
                            label: 'Delete',
                            icon: <Trash2 className="h-4 w-4" />,
                            onClick: () => handleDeleteProduct(product),
                            danger: true,
                          },
                        ]}
                      />
                    </div>
                  </div>
                  <CardBody>
                    <h3 className="truncate font-semibold text-wa-text dark:text-zinc-100">
                      {product.name}
                    </h3>
                    <div className="mt-1 flex items-center gap-2">
                      {product.salePrice ? (
                        <>
                          <p className="text-lg font-bold text-wa-teal">
                            {formatPrice(product.salePrice, product.currency)}
                          </p>
                          <p className="text-sm text-wa-text-muted dark:text-zinc-500 line-through">
                            {formatPrice(product.price, product.currency)}
                          </p>
                        </>
                      ) : (
                        <p className="text-lg font-bold text-wa-teal">
                          {formatPrice(product.price, product.currency)}
                        </p>
                      )}
                    </div>
                    {product.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-wa-text-secondary dark:text-zinc-300">
                        {product.description}
                      </p>
                    )}
                    <div className="mt-3 flex items-center justify-between">
                      <Toggle
                        checked={product.isVisible}
                        onChange={() => handleToggleVisibility(product)}
                        label="Visible"
                      />
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Collections Tab */}
      {activeTab === 'collections' && (
        <>
          {filteredCollections.length === 0 ? (
            <EmptyState
              icon={<FolderOpen className="h-10 w-10" />}
              title="No collections found"
              description={
                search
                  ? 'No collections match your search.'
                  : 'Create collections to organize your products.'
              }
              action={
                !search ? (
                  <Button
                    icon={<Plus className="h-4 w-4" />}
                    onClick={openCreateCollection}
                  >
                    Add Collection
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-3">
              {filteredCollections.map((collection) => (
                <Card key={collection.id} className="dark:bg-zinc-800 dark:border-zinc-700">
                  <CardBody>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-wa-teal/10 dark:bg-wa-teal/20">
                          <FolderOpen className="h-5 w-5 text-wa-teal" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-wa-text dark:text-zinc-100">
                            {collection.name}
                          </h3>
                          <p className="text-sm text-wa-text-secondary dark:text-zinc-300">
                            {collection.productIds.length} product
                            {collection.productIds.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Show small product avatars */}
                        <div className="flex -space-x-2">
                          {collection.productIds.slice(0, 3).map((pid) => {
                            const product = products.find((p) => p.id === pid);
                            return (
                              <div
                                key={pid}
                                className="h-8 w-8 overflow-hidden rounded-full border-2 border-white dark:border-zinc-800 bg-gray-100 dark:bg-zinc-700"
                              >
                                {product?.imageUrl ? (
                                  <img
                                    src={product.imageUrl}
                                    alt={product.name}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full items-center justify-center">
                                    <Package className="h-3 w-3 text-gray-400 dark:text-zinc-500" />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {collection.productIds.length > 3 && (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white dark:border-zinc-800 bg-wa-bg dark:bg-zinc-700 text-xs font-medium text-wa-text-muted dark:text-zinc-400">
                              +{collection.productIds.length - 3}
                            </div>
                          )}
                        </div>
                        <DropdownMenu
                          trigger={
                            <button className="rounded-lg p-1.5 hover:bg-wa-hover dark:hover:bg-zinc-700">
                              <MoreVertical className="h-4 w-4 text-wa-text-muted dark:text-zinc-500" />
                            </button>
                          }
                          items={[
                            {
                              label: 'Edit',
                              icon: <Pencil className="h-4 w-4" />,
                              onClick: () => openEditCollection(collection),
                            },
                            {
                              label: 'Delete',
                              icon: <Trash2 className="h-4 w-4" />,
                              onClick: () => handleDeleteCollection(collection),
                              danger: true,
                            },
                          ]}
                        />
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Product Modal */}
      <Modal
        open={showProductModal}
        onClose={() => setShowProductModal(false)}
        title={editingProduct ? 'Edit Product' : 'Add Product'}
        description={
          editingProduct
            ? 'Update product details'
            : 'Add a new product to your catalog'
        }
      >
        <div className="space-y-4">
          <Input
            label="Product Name"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="Enter product name..."
          />

          <Textarea
            label="Description"
            value={productDescription}
            onChange={(e) => setProductDescription(e.target.value)}
            placeholder="Product description..."
            maxLength={1024}
            showCount
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Price"
              type="number"
              value={productPrice}
              onChange={(e) => setProductPrice(e.target.value)}
              placeholder="0.00"
              prefix={<span className="text-xs font-medium text-wa-text-secondary dark:text-zinc-400">
                {productCurrency === 'XOF' || productCurrency === 'XAF' ? 'FCFA' :
                 productCurrency === 'USD' ? '$' :
                 productCurrency === 'EUR' ? '€' :
                 productCurrency === 'GBP' ? '£' :
                 productCurrency === 'NGN' ? '₦' :
                 productCurrency === 'GHS' ? '₵' :
                 productCurrency === 'INR' ? '₹' :
                 productCurrency === 'BRL' ? 'R$' :
                 productCurrency}
              </span>}
            />
            <Select
              label="Currency"
              value={productCurrency}
              onChange={(e) => setProductCurrency(e.target.value)}
              options={CURRENCIES}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-wa-text dark:text-zinc-100">Product Image</label>
            <div className="flex items-center gap-3">
              <label
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-wa-border dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 text-sm text-wa-text-secondary dark:text-zinc-300 transition-colors hover:border-wa-green hover:bg-wa-light-green/30 dark:hover:bg-zinc-700"
              >
                <ImageIcon className="h-4 w-4" />
                Choose Image
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => setProductImageUrl(reader.result as string);
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              {productImageUrl && (
                <button
                  onClick={() => setProductImageUrl('')}
                  className="text-xs text-wa-danger hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
            {!productImageUrl && (
              <Input
                value={productImageUrl}
                onChange={(e) => setProductImageUrl(e.target.value)}
                placeholder="Or paste an image URL..."
                prefix={<ImageIcon className="h-4 w-4" />}
                className="mt-2"
              />
            )}
          </div>

          {productImageUrl && (
            <div className="h-32 w-32 overflow-hidden rounded-lg bg-gray-100 dark:bg-zinc-700">
              <img
                src={productImageUrl}
                alt="Preview"
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}

          <Input
            label="Product URL"
            value={productUrl}
            onChange={(e) => setProductUrl(e.target.value)}
            placeholder="https://example.com/product"
            prefix={<ExternalLink className="h-4 w-4" />}
          />

          <Toggle
            checked={productVisible}
            onChange={setProductVisible}
            label="Visible in catalog"
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => setShowProductModal(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveProduct}
              loading={savingProduct}
              disabled={!productName.trim()}
            >
              {editingProduct ? 'Update' : 'Add Product'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Collection Modal */}
      <Modal
        open={showCollectionModal}
        onClose={() => setShowCollectionModal(false)}
        title={editingCollection ? 'Edit Collection' : 'Add Collection'}
        description={
          editingCollection
            ? 'Update collection details'
            : 'Create a new product collection'
        }
      >
        <div className="space-y-4">
          <Input
            label="Collection Name"
            value={collectionName}
            onChange={(e) => setCollectionName(e.target.value)}
            placeholder="Enter collection name..."
          />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-wa-text dark:text-zinc-100">
              Products ({collectionProducts.length} selected)
            </label>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-wa-border dark:border-zinc-700">
              {products.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-wa-text-muted dark:text-zinc-500">
                  No products available. Create products first.
                </p>
              ) : (
                products.map((product) => {
                  const isSelected = collectionProducts.includes(product.id);
                  return (
                    <button
                      key={product.id}
                      onClick={() =>
                        setCollectionProducts((prev) =>
                          isSelected
                            ? prev.filter((id) => id !== product.id)
                            : [...prev, product.id]
                        )
                      }
                      className="flex w-full items-center gap-3 border-b border-wa-border dark:border-zinc-700 px-4 py-2 text-left transition-colors last:border-0 hover:bg-wa-hover dark:hover:bg-zinc-700"
                    >
                      <div
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                          isSelected
                            ? 'border-wa-teal bg-wa-teal text-white'
                            : 'border-wa-border dark:border-zinc-600 bg-white dark:bg-zinc-800'
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>
                      <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-gray-100 dark:bg-zinc-700">
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Package className="h-3 w-3 text-gray-400 dark:text-zinc-500" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-wa-text dark:text-zinc-100">
                          {product.name}
                        </span>
                        {product.salePrice ? (
                          <>
                            <span className="ml-2 text-xs font-medium text-wa-teal">
                              {formatPrice(product.salePrice, product.currency)}
                            </span>
                            <span className="ml-1 text-xs text-wa-text-muted dark:text-zinc-500 line-through">
                              {formatPrice(product.price, product.currency)}
                            </span>
                          </>
                        ) : (
                          <span className="ml-2 text-xs text-wa-text-muted dark:text-zinc-500">
                            {formatPrice(product.price, product.currency)}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => setShowCollectionModal(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveCollection}
              loading={savingCollection}
              disabled={!collectionName.trim()}
            >
              {editingCollection ? 'Update' : 'Create'}
            </Button>
          </div>
        </div>
      </Modal>
      </div>
    </div>
  );
}
