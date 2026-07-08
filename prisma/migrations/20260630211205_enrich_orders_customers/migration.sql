-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "acceptsMarketing" BOOLEAN;
ALTER TABLE "Customer" ADD COLUMN "businessName" TEXT;
ALTER TABLE "Customer" ADD COLUMN "city" TEXT;
ALTER TABLE "Customer" ADD COLUMN "customerType" TEXT;
ALTER TABLE "Customer" ADD COLUMN "firstOrderAt" DATETIME;
ALTER TABLE "Customer" ADD COLUMN "identification" TEXT;
ALTER TABLE "Customer" ADD COLUMN "province" TEXT;
ALTER TABLE "Customer" ADD COLUMN "rawData" TEXT;
ALTER TABLE "Customer" ADD COLUMN "totalSpentTn" REAL;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "cancelledAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "channel" TEXT;
ALTER TABLE "Order" ADD COLUMN "closedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "completedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "currency" TEXT;
ALTER TABLE "Order" ADD COLUMN "customerNote" TEXT;
ALTER TABLE "Order" ADD COLUMN "discount" REAL;
ALTER TABLE "Order" ADD COLUMN "ownerNote" TEXT;
ALTER TABLE "Order" ADD COLUMN "paidAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "paymentMethod" TEXT;
ALTER TABLE "Order" ADD COLUMN "rawData" TEXT;
ALTER TABLE "Order" ADD COLUMN "shippedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "shippingAddress" TEXT;
ALTER TABLE "Order" ADD COLUMN "shippingCarrier" TEXT;
ALTER TABLE "Order" ADD COLUMN "shippingCost" REAL;
ALTER TABLE "Order" ADD COLUMN "shippingMethod" TEXT;
ALTER TABLE "Order" ADD COLUMN "shippingStatus" TEXT;
ALTER TABLE "Order" ADD COLUMN "shippingType" TEXT;
ALTER TABLE "Order" ADD COLUMN "subtotal" REAL;
ALTER TABLE "Order" ADD COLUMN "totalPaid" REAL;
ALTER TABLE "Order" ADD COLUMN "trackingNumber" TEXT;
ALTER TABLE "Order" ADD COLUMN "trackingUrl" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "sku" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "variantName" TEXT;
