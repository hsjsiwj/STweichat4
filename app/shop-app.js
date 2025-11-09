// WeChat Shop Module

class ShopApp {
    constructor() {
        this.products = [];
        this.orders = [];
    }

    init() {
        console.log('[WeChat Shop] 初始化');
        this.loadData();
        document.addEventListener('wechat-sync-product', (event) => this.addProduct(event.detail));
        document.addEventListener('wechat-sync-purchase', (event) => this.addOrder(event.detail));
    }

    loadData() {
        this.products = JSON.parse(localStorage.getItem('wechat_products')) || [];
        this.orders = JSON.parse(localStorage.getItem('wechat_orders')) || [];
    }

    saveData() {
        localStorage.setItem('wechat_products', JSON.stringify(this.products));
        localStorage.setItem('wechat_orders', JSON.stringify(this.orders));
    }

    addProduct(productData) {
        if (!this.products.find(p => p.name === productData.name)) {
            this.products.push(productData);
            this.saveData();
            if (document.querySelector('.shop-products')) {
                this.renderShop();
            }
        }
    }

    addOrder(orderData) {
        this.orders.unshift(orderData);
        this.saveData();
        if (document.querySelector('.shop-orders')) {
            this.renderShop();
        }
    }

    renderShop() {
        const content = document.getElementById('wechat-content');
        content.innerHTML = `
            <div class="shop">
                <h3>商品列表</h3>
                <ul class="shop-products"></ul>
                <h3>我的订单</h3>
                <ul class="shop-orders"></ul>
            </div>
        `;

        const productList = content.querySelector('.shop-products');
        this.products.forEach(p => {
            const item = document.createElement('li');
            item.innerHTML = `
                <span>${p.name} - ¥${p.price}</span>
                <p>${p.desc}</p>
                <button data-name="${p.name}">购买</button>
            `;
            item.querySelector('button').addEventListener('click', (e) => {
                const productName = e.target.dataset.name;
                this.purchaseProduct(productName);
            });
            productList.appendChild(item);
        });

        const orderList = content.querySelector('.shop-orders');
        this.orders.forEach(o => {
            const item = document.createElement('li');
            item.innerHTML = `${o.name} x${o.qty} - ¥${o.total}`;
            orderList.appendChild(item);
        });
        
        if (window.wechatPhone) {
            window.wechatPhone.setTitle('商城');
        }
    }

    purchaseProduct(productName) {
        const quantity = prompt(`购买 ${productName}，请输入数量:`, 1);
        if (quantity && !isNaN(quantity) && quantity > 0) {
            const command = `[购买|${productName}|${quantity}]`;
            SillyTavern.getContext().sendSystemMessage(command, true);
        }
    }
}

window.shopApp = new ShopApp();
function initShopApp() {
    window.shopApp.init();
}
window.initShopApp = initShopApp;