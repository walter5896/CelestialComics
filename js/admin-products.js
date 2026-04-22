// /js/admin-products.js
import {
  parseJsonResponseSafely,
  updatePreviewImage,
  prettyProductType,
  isComicProductType,
  fileToBase64
} from './admin-shared.js';

let productsModuleInitialized = false;
let allProducts = [];
let editingProductId = null;

function setStatus(el, message = '', color = '') {
  if (!el) return;
  el.textContent = message;
  el.style.color = color;
}

function getSafeStories(ctx) {
  if (typeof ctx.getAllStories === 'function') {
    return ctx.getAllStories() || [];
  }

  return Array.isArray(ctx.allStories) ? ctx.allStories : [];
}

function setAllProductsState(nextProducts, ctx) {
  allProducts = Array.isArray(nextProducts) ? nextProducts : [];

  if (typeof ctx.setAllProducts === 'function') {
    ctx.setAllProducts(allProducts);
  }
}

export function syncProductFormRules(ctx) {
  const {
    productType,
    productStoryId,
    productVotesGranted
  } = ctx;

  const selectedType = productType?.value || 'merch';
  const comicProduct = isComicProductType(selectedType);

  if (productStoryId) {
    productStoryId.disabled = !comicProduct;

    if (!comicProduct) {
      productStoryId.value = '';
    }
  }

  if (productVotesGranted) {
    if (comicProduct) {
      productVotesGranted.value = '0';
      productVotesGranted.disabled = true;
    } else {
      productVotesGranted.disabled = false;
    }
  }
}

export function populateReleasedStoryOptions(ctx) {
  const { productStoryId } = ctx;
  if (!productStoryId) return;

  const releasedStories = getSafeStories(ctx).filter(
    (story) => story.story_status === 'released' && story.active
  );

  const currentValue = productStoryId.value;

  productStoryId.innerHTML = '<option value="">-- No Linked Story --</option>';

  releasedStories.forEach((story) => {
    const option = document.createElement('option');
    option.value = story.id;
    option.textContent = story.title;
    productStoryId.appendChild(option);
  });

  if (currentValue && releasedStories.some((story) => String(story.id) === String(currentValue))) {
    productStoryId.value = currentValue;
  }
}

export function clearProductForm(ctx) {
  const {
    productSelect,
    productForm,
    productActive,
    productVotesGranted,
    productType,
    productStoryId,
    saveProductBtn,
    deactivateProductBtn,
    deleteProductImageBtn,
    productStatusMsg,
    productImageUploadMessage,
    productImageFile,
    productImagePreview
  } = ctx;

  editingProductId = null;

  if (productSelect) productSelect.value = '';
  productForm?.reset();

  if (productActive) productActive.checked = true;
  if (productVotesGranted) productVotesGranted.value = '0';
  if (productType) productType.value = 'merch';
  if (productStoryId) productStoryId.value = '';

  if (saveProductBtn) {
    saveProductBtn.disabled = false;
    saveProductBtn.textContent = 'Create Product';
  }

  if (deactivateProductBtn) {
    deactivateProductBtn.style.display = 'none';
  }

  if (deleteProductImageBtn) {
    deleteProductImageBtn.style.display = 'none';
  }

  setStatus(productStatusMsg, '', '');
  setStatus(productImageUploadMessage, '', '');

  if (productImageFile) {
    productImageFile.value = '';
  }

  updatePreviewImage(productImagePreview, '');
  syncProductFormRules(ctx);
}

export function populateProductForm(product, ctx) {
  const {
    productName,
    productDescription,
    productPriceCents,
    productVotesGranted,
    productImageUrl,
    productImagePreview,
    productActive,
    productType,
    productStoryId,
    productStatusMsg,
    productImageUploadMessage,
    productImageFile,
    saveProductBtn,
    deactivateProductBtn,
    deleteProductImageBtn
  } = ctx;

  editingProductId = product.id;

  if (productName) productName.value = product.name || '';
  if (productDescription) productDescription.value = product.description || '';
  if (productPriceCents) {
    productPriceCents.value = Number.isInteger(product.price_cents) ? product.price_cents : '';
  }
  if (productVotesGranted) {
    productVotesGranted.value = Number(product.votes_granted) || 0;
  }
  if (productImageUrl) {
    productImageUrl.value = product.image_url || '';
  }
  if (productActive) {
    productActive.checked = !!product.active;
  }

  if (productType) {
    productType.value = product.product_type || 'merch';
  }

  populateReleasedStoryOptions(ctx);

  if (productStoryId) {
    productStoryId.value = product.story_id || '';
  }

  updatePreviewImage(productImagePreview, product.image_url || '');

  setStatus(productStatusMsg, 'Editing existing product.', '#2563eb');
  setStatus(productImageUploadMessage, '', '');

  if (productImageFile) {
    productImageFile.value = '';
  }

  if (saveProductBtn) {
    saveProductBtn.disabled = false;
    saveProductBtn.textContent = 'Update Product';
  }

  if (deactivateProductBtn) {
    deactivateProductBtn.style.display = 'inline-block';
  }

  if (deleteProductImageBtn) {
    deleteProductImageBtn.style.display = product.image_url ? 'inline-block' : 'none';
  }

  syncProductFormRules(ctx);
}

export function renderProductsPreview(products, ctx) {
  const { productsPreview } = ctx;
  if (!productsPreview) return;

  productsPreview.innerHTML = '';

  const safeProducts = Array.isArray(products) ? products : [];

  if (!safeProducts.length) {
    productsPreview.innerHTML = '<p>No products yet.</p>';
    return;
  }

  safeProducts.forEach((product) => {
    const card = document.createElement('div');
    card.className = 'product-card';

    const priceText = Number.isInteger(product.price_cents)
      ? `$${(product.price_cents / 100).toFixed(2)}`
      : 'Price unavailable';

    const linkedStoryTitle = product.stories?.title || 'No linked story';

    card.innerHTML = `
      ${product.image_url ? `<img src="${product.image_url}" alt="${product.name}">` : ''}
      <strong>${product.name}</strong>
      <div class="product-meta"><strong>Type:</strong> ${prettyProductType(product.product_type)}</div>
      <div class="product-meta"><strong>Story:</strong> ${product.story_id ? linkedStoryTitle : 'None'}</div>
      <div class="product-meta">${product.description || 'No description set.'}</div>
      <div class="product-meta"><strong>Price:</strong> ${priceText}</div>
      <div class="product-meta"><strong>Bonus Votes:</strong> ${product.votes_granted ?? 0}</div>
      <div class="product-meta"><strong>Status:</strong> ${product.active ? 'Active' : 'Inactive'}</div>
    `;

    productsPreview.appendChild(card);
  });
}

export async function loadProductsPreview(ctx) {
  const { productSelect, productsPreview } = ctx;

  try {
    const { data: products, error } = await ctx.supabase
      .from('products')
      .select(`
        id,
        name,
        description,
        price_cents,
        stripe_product_id,
        stripe_price_id,
        image_url,
        image_path,
        active,
        votes_granted,
        product_type,
        story_id,
        created_at,
        updated_at,
        stories (
          id,
          title
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    setAllProductsState(products || [], ctx);

    if (productSelect) {
      productSelect.innerHTML = '<option value="">-- Create New Product --</option>';

      allProducts.forEach((product) => {
        const option = document.createElement('option');
        option.value = product.id;
        option.textContent = `${product.name} (${prettyProductType(product.product_type || 'merch')})`;
        productSelect.appendChild(option);
      });
    }

    populateReleasedStoryOptions(ctx);
    renderProductsPreview(allProducts, ctx);
  } catch (err) {
    console.error('Error loading products preview:', err);

    if (productsPreview) {
      productsPreview.innerHTML = '<p>Failed to load products.</p>';
    }
  }
}

export function handleProductSelectChange(ctx) {
  const selectedId = ctx.productSelect?.value || '';

  if (!selectedId) {
    clearProductForm(ctx);
    return;
  }

  const selectedProduct = allProducts.find(
    (product) => String(product.id) === String(selectedId)
  );

  if (selectedProduct) {
    populateProductForm(selectedProduct, ctx);
  }
}

export function handleProductImageUrlInput(ctx) {
  updatePreviewImage(ctx.productImagePreview, ctx.productImageUrl?.value || '');
}

export async function handleProductImageUpload(ctx) {
  const {
    productImageUploadMessage,
    productImageFile,
    uploadProductImageBtn,
    deleteProductImageBtn,
    productImageUrl
  } = ctx;

  try {
    setStatus(productImageUploadMessage, '', '');

    if (!editingProductId) {
      throw new Error('Create or select a product before uploading an image.');
    }

    const file = productImageFile?.files?.[0];
    if (!file) {
      throw new Error('Please choose an image file first.');
    }

    const token = await ctx.getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    if (uploadProductImageBtn) {
      uploadProductImageBtn.disabled = true;
      uploadProductImageBtn.textContent = 'Uploading...';
    }

    const file_base64 = await fileToBase64(file);

    const res = await fetch('/.netlify/functions/upload-product-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        product_id: editingProductId,
        file_name: file.name,
        file_type: file.type,
        file_base64
      })
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to upload product image');
    }

    setStatus(productImageUploadMessage, 'Product image uploaded successfully!', 'green');

    if (result.image_url) {
      if (productImageUrl) {
        productImageUrl.value = result.image_url;
      }

      updatePreviewImage(ctx.productImagePreview, result.image_url);
    }

    if (deleteProductImageBtn) {
      deleteProductImageBtn.style.display = 'inline-block';
    }

    if (productImageFile) {
      productImageFile.value = '';
    }

    await loadProductsPreview(ctx);

    const refreshedProduct = allProducts.find(
      (product) => String(product.id) === String(editingProductId)
    );

    if (refreshedProduct) {
      populateProductForm(refreshedProduct, ctx);
      if (ctx.productSelect) ctx.productSelect.value = editingProductId;
    }
  } catch (err) {
    console.error('Error uploading product image:', err);
    setStatus(productImageUploadMessage, err.message || 'Failed to upload product image.', 'red');
  } finally {
    if (uploadProductImageBtn) {
      uploadProductImageBtn.disabled = false;
      uploadProductImageBtn.textContent = 'Upload Product Image';
    }
  }
}

export async function handleDeleteProductImage(ctx) {
  const {
    deleteProductImageBtn,
    productImageUploadMessage,
    productImageUrl,
    productImageFile
  } = ctx;

  try {
    if (!editingProductId) {
      throw new Error('Select a product first.');
    }

    const confirmed = confirm('Delete this product image?');
    if (!confirmed) return;

    const token = await ctx.getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    if (deleteProductImageBtn) {
      deleteProductImageBtn.disabled = true;
      deleteProductImageBtn.textContent = 'Deleting...';
    }

    const res = await fetch('/.netlify/functions/delete-product-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        product_id: editingProductId
      })
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to delete product image');
    }

    setStatus(productImageUploadMessage, 'Product image deleted successfully.', 'green');

    if (productImageUrl) {
      productImageUrl.value = '';
    }

    updatePreviewImage(ctx.productImagePreview, '');

    if (productImageFile) {
      productImageFile.value = '';
    }

    await loadProductsPreview(ctx);

    const refreshedProduct = allProducts.find(
      (product) => String(product.id) === String(editingProductId)
    );

    if (refreshedProduct) {
      populateProductForm(refreshedProduct, ctx);
      if (ctx.productSelect) ctx.productSelect.value = editingProductId;
    } else {
      clearProductForm(ctx);
    }
  } catch (err) {
    console.error('Error deleting product image:', err);
    setStatus(productImageUploadMessage, err.message || 'Failed to delete product image.', 'red');
  } finally {
    if (deleteProductImageBtn) {
      deleteProductImageBtn.disabled = false;
      deleteProductImageBtn.textContent = 'Delete Product Image';
    }
  }
}

export async function handleProductSubmit(event, ctx) {
  event.preventDefault();

  const {
    productName,
    productDescription,
    productImageUrl,
    productActive,
    productPriceCents,
    productType,
    productStoryId,
    productVotesGranted,
    saveProductBtn,
    productStatusMsg,
    productSelect
  } = ctx;

  setStatus(productStatusMsg, '', '');

  try {
    const token = await ctx.getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    const name = productName.value.trim();
    const description = productDescription.value.trim();
    const image_url = productImageUrl.value.trim() || null;
    const active = productActive.checked;
    const price_cents = Number(productPriceCents.value);
    const product_type = productType.value;
    const story_id = productStoryId.value || null;
    const votes_granted = Number(productVotesGranted.value);

    if (!name) {
      throw new Error('Product name is required.');
    }

    if (!description) {
      throw new Error('Product description is required.');
    }

    if (!Number.isInteger(price_cents) || price_cents <= 0) {
      throw new Error('Price must be a positive whole number in cents.');
    }

    if (!['merch', 'digital_comic', 'paperback', 'bundle'].includes(product_type)) {
      throw new Error('Invalid product type.');
    }

    if (isComicProductType(product_type) && !story_id) {
      throw new Error('Comic products must be linked to a released story.');
    }

    if (product_type === 'merch' && story_id) {
      throw new Error('Merch products should not be linked to a story.');
    }

    if (!Number.isInteger(votes_granted) || votes_granted < 0) {
      throw new Error('Bonus votes must be 0 or greater.');
    }

    if (isComicProductType(product_type) && votes_granted > 0) {
      throw new Error('Comic products should not grant bonus votes.');
    }

    const isEditing = !!editingProductId;

    if (saveProductBtn) {
      saveProductBtn.disabled = true;
      saveProductBtn.textContent = isEditing ? 'Updating...' : 'Creating...';
    }

    const endpoint = isEditing
      ? '/.netlify/functions/update-product'
      : '/.netlify/functions/create-product';

    const payload = isEditing
      ? {
          product_id: editingProductId,
          name,
          description,
          image_url,
          active,
          price_cents,
          votes_granted,
          product_type,
          story_id
        }
      : {
          name,
          description,
          image_url,
          active,
          price_cents,
          votes_granted,
          product_type,
          story_id
        };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || (isEditing ? 'Failed to update product' : 'Failed to create product'));
    }

    setStatus(
      productStatusMsg,
      isEditing ? 'Product updated successfully!' : 'Product created successfully!',
      'green'
    );

    const savedProductId = result.product?.id || editingProductId || null;

    await loadProductsPreview(ctx);

    if (savedProductId) {
      const refreshedProduct = allProducts.find(
        (product) => String(product.id) === String(savedProductId)
      );

      if (refreshedProduct) {
        populateProductForm(refreshedProduct, ctx);
        if (productSelect) productSelect.value = savedProductId;
      } else {
        clearProductForm(ctx);
      }
    } else {
      clearProductForm(ctx);
    }
  } catch (err) {
    console.error('Error saving product:', err);
    setStatus(productStatusMsg, err.message || 'Failed to save product.', 'red');
  } finally {
    if (saveProductBtn) {
      saveProductBtn.disabled = false;
      saveProductBtn.textContent = editingProductId ? 'Update Product' : 'Create Product';
    }
  }
}

export async function handleDeactivateProduct(ctx) {
  const {
    deactivateProductBtn,
    productStatusMsg
  } = ctx;

  if (!editingProductId) return;

  const confirmed = confirm(
    'Deactivate this product? It will remain in the database but no longer be available for sale.'
  );
  if (!confirmed) return;

  try {
    const token = await ctx.getAccessToken();
    if (!token) {
      throw new Error('No active session found.');
    }

    const existingProduct = allProducts.find(
      (product) => String(product.id) === String(editingProductId)
    );

    if (!existingProduct) {
      throw new Error('Product not found in current admin state.');
    }

    if (deactivateProductBtn) {
      deactivateProductBtn.disabled = true;
      deactivateProductBtn.textContent = 'Deactivating...';
    }

    const res = await fetch('/.netlify/functions/update-product', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        product_id: editingProductId,
        name: existingProduct.name,
        description: existingProduct.description,
        image_url: existingProduct.image_url,
        active: false,
        price_cents: existingProduct.price_cents,
        votes_granted: existingProduct.votes_granted,
        product_type: existingProduct.product_type || 'merch',
        story_id: existingProduct.story_id || null
      })
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to deactivate product');
    }

    setStatus(productStatusMsg, 'Product deactivated successfully.', 'green');

    await loadProductsPreview(ctx);

    const refreshedProduct = allProducts.find(
      (product) => String(product.id) === String(editingProductId)
    );

    if (refreshedProduct) {
      populateProductForm(refreshedProduct, ctx);
      if (ctx.productSelect) ctx.productSelect.value = editingProductId;
    } else {
      clearProductForm(ctx);
    }
  } catch (err) {
    console.error('Error deactivating product:', err);
    setStatus(productStatusMsg, err.message || 'Failed to deactivate product.', 'red');
  } finally {
    if (deactivateProductBtn) {
      deactivateProductBtn.disabled = false;
      deactivateProductBtn.textContent = 'Deactivate Product';
    }
  }
}

export function initAdminProducts(ctx) {
  if (productsModuleInitialized) return;
  productsModuleInitialized = true;

  const {
    productType,
    resetProductBtn,
    deactivateProductBtn,
    uploadProductImageBtn,
    deleteProductImageBtn,
    productImageUrl,
    productForm,
    productSelect
  } = ctx;

  productSelect?.addEventListener('change', () => {
    handleProductSelectChange(ctx);
  });

  productType?.addEventListener('change', () => {
    syncProductFormRules(ctx);
  });

  resetProductBtn?.addEventListener('click', () => {
    clearProductForm(ctx);
  });

  deactivateProductBtn?.addEventListener('click', async () => {
    await handleDeactivateProduct(ctx);
  });

  uploadProductImageBtn?.addEventListener('click', async () => {
    await handleProductImageUpload(ctx);
  });

  deleteProductImageBtn?.addEventListener('click', async () => {
    await handleDeleteProductImage(ctx);
  });

  productImageUrl?.addEventListener('input', () => {
    handleProductImageUrlInput(ctx);
  });

  productForm?.addEventListener('submit', async (event) => {
    await handleProductSubmit(event, ctx);
  });
}