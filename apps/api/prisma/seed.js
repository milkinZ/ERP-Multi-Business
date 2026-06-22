"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const permissions = [
    'product.create',
    'product.read',
    'product.update',
    'product.delete',
    'order.create',
    'order.read',
    'order.update',
    'inventory.read',
    'inventory.adjust',
    'report.read',
    'payment.create',
    'payment.read',
    'analytics.read',
    'kitchen.read',
    'kitchen.update',
    'recipe.create',
    'recipe.read',
    'recipe.update',
    'ingredient.create',
    'ingredient.read',
    'ingredient.update',
    'warehouse.read',
    'warehouse.update',
    'warehouse.create',
    'warehouse.delete',
    'supplier.create',
    'supplier.read',
    'supplier.update',
    'supplier.delete',
    'stock.create',
    'stock.read',
    'stock.update',
    'stock.delete',
    'purchase_order.create',
    'purchase_order.read',
    'purchase_order.update',
    'purchase_order.delete',
    'purchase_order.approve',
    'purchase_order.receive',
    'queue.view',
];
async function main() {
    for (const code of permissions) {
        await prisma.permission.upsert({
            where: {
                code,
            },
            update: {},
            create: {
                code,
                name: code,
            },
        });
    }
}
main()
    .catch((error) => {
    console.error(error);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map