import { useState, useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  Text,
  InlineStack,
  Select,
  TextField,
  Banner,
  Spinner,
  DataTable,
  Badge,
  Link,
  Box,
  ProgressBar,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "export") {
    const dateFrom = formData.get("dateFrom");
    const dateTo = formData.get("dateTo");
    const status = formData.get("status") || "any";
    const exportAll = formData.get("exportAll") === "true";

    if (!dateFrom || !dateTo) {
      return { success: false, error: "Please provide both start and end dates." };
    }

    // Build query filters
    let query = `created_at:>=${dateFrom} created_at:<=${dateTo}`;
    if (status !== "any") {
      query += ` status:${status}`;
    }

    let allOrders = [];
    let hasNextPage = true;
    let cursor = null;
    let batchCount = 0;
    const maxBatches = exportAll ? 20 : 1; // Limit to 20 batches (5000 orders) for safety

    while (hasNextPage && batchCount < maxBatches) {
      const variables = {
        query,
        first: 250,
      };

      if (cursor) {
        variables.after = cursor;
      }

      const response = await admin.graphql(
        `#graphql
          query getOrders($query: String!, $first: Int!, $after: String) {
            orders(query: $query, first: $first, after: $after) {
              edges {
                node {
                  id
                  name
                  createdAt
                  displayFinancialStatus
                  displayFulfillmentStatus
                  totalPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  customer {
                    id
                    firstName
                    lastName
                    email
                  }
                  lineItems(first: 250) {
                    edges {
                      node {
                        id
                        name
                        quantity
                        sku
                        variantTitle
                        originalUnitPriceSet {
                          shopMoney {
                            amount
                            currencyCode
                          }
                        }
                        product {
                          id
                          title
                          handle
                        }
                        variant {
                          id
                          title
                          sku
                          barcode
                        }
                      }
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }`,
        { variables }
      );

      const responseJson = await response.json();
      const orders = responseJson.data.orders.edges.map(edge => edge.node);
      
      allOrders = allOrders.concat(orders);
      hasNextPage = responseJson.data.orders.pageInfo.hasNextPage;
      cursor = responseJson.data.orders.pageInfo.endCursor;
      batchCount++;

      // Add a small delay to avoid rate limiting
      if (hasNextPage && batchCount < maxBatches) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Transform data for export
    const exportData = allOrders.map(order => {
      const orderData = {
        order_id: order.id.replace("gid://shopify/Order/", ""),
        order_name: order.name,
        created_at: order.createdAt,
        financial_status: order.displayFinancialStatus,
        fulfillment_status: order.displayFulfillmentStatus,
        total_price: order.totalPriceSet.shopMoney.amount,
        currency: order.totalPriceSet.shopMoney.currencyCode,
        customer_id: order.customer?.id?.replace("gid://shopify/Customer/", "") || "",
        customer_name: order.customer ? `${order.customer.firstName || ""} ${order.customer.lastName || ""}`.trim() : "",
        customer_email: order.customer?.email || "",
        line_items: []
      };

      order.lineItems.edges.forEach(lineItem => {
        const item = lineItem.node;
        orderData.line_items.push({
          line_item_id: item.id.replace("gid://shopify/LineItem/", ""),
          product_id: item.product?.id?.replace("gid://shopify/Product/", "") || "",
          product_title: item.product?.title || "",
          product_handle: item.product?.handle || "",
          variant_id: item.variant?.id?.replace("gid://shopify/ProductVariant/", "") || "",
          variant_title: item.variant?.title || item.variantTitle || "",
          variant_sku: item.variant?.sku || item.sku || "",
          variant_barcode: item.variant?.barcode || "",
          quantity: item.quantity,
          unit_price: item.originalUnitPriceSet.shopMoney.amount,
          unit_price_currency: item.originalUnitPriceSet.shopMoney.currencyCode
        });
      });

      return orderData;
    });

    return { 
      orders: exportData, 
      success: true, 
      totalBatches: batchCount,
      hasMore: hasNextPage && batchCount >= maxBatches
    };
  }

  return { success: false };
};

export default function OrdersExport() {
  const fetcher = useFetcher();
  const [exportData, setExportData] = useState(null);
  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    status: "any",
    exportAll: false
  });

  const isLoadingExport = fetcher.state === "submitting";

  const handleExport = () => {
    const formData = new FormData();
    formData.append("action", "export");
    formData.append("dateFrom", filters.dateFrom);
    formData.append("dateTo", filters.dateTo);
    formData.append("status", filters.status);
    formData.append("exportAll", filters.exportAll.toString());
    
    fetcher.submit(formData, { method: "POST" });
  };

  const downloadCSV = (data) => {
    if (!data || data.length === 0) return;

    // Flatten the data for CSV export
    const flattenedData = [];
    data.forEach(order => {
      if (order.line_items.length === 0) {
        // Add order with empty line item
        flattenedData.push({
          order_id: order.order_id,
          order_name: order.order_name,
          created_at: order.created_at,
          financial_status: order.financial_status,
          fulfillment_status: order.fulfillment_status,
          total_price: order.total_price,
          currency: order.currency,
          customer_id: order.customer_id,
          customer_name: order.customer_name,
          customer_email: order.customer_email,
          line_item_id: "",
          product_id: "",
          product_title: "",
          product_handle: "",
          variant_id: "",
          variant_title: "",
          variant_sku: "",
          variant_barcode: "",
          quantity: "",
          unit_price: "",
          unit_price_currency: ""
        });
      } else {
        // Add order with each line item
        order.line_items.forEach(item => {
          flattenedData.push({
            order_id: order.order_id,
            order_name: order.order_name,
            created_at: order.created_at,
            financial_status: order.financial_status,
            fulfillment_status: order.fulfillment_status,
            total_price: order.total_price,
            currency: order.currency,
            customer_id: order.customer_id,
            customer_name: order.customer_name,
            customer_email: order.customer_email,
            ...item
          });
        });
      }
    });

    const headers = [
      "Order ID", "Order Name", "Created At", "Financial Status", "Fulfillment Status",
      "Total Price", "Currency", "Customer ID", "Customer Name", "Customer Email",
      "Line Item ID", "Product ID", "Product Title", "Product Handle", "Variant ID",
      "Variant Title", "Variant SKU", "Variant Barcode", "Quantity", "Unit Price", "Unit Price Currency"
    ];

    const csvContent = [
      headers.join(","),
      ...flattenedData.map(row => [
        row.order_id,
        `"${row.order_name}"`,
        row.created_at,
        row.financial_status,
        row.fulfillment_status,
        row.total_price,
        row.currency,
        row.customer_id,
        `"${row.customer_name}"`,
        `"${row.customer_email}"`,
        row.line_item_id,
        row.product_id,
        `"${row.product_title}"`,
        row.product_handle,
        row.variant_id,
        `"${row.variant_title}"`,
        row.variant_sku,
        row.variant_barcode,
        row.quantity,
        row.unit_price,
        row.unit_price_currency
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders_export_${filters.dateFrom}_to_${filters.dateTo}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.orders) {
      setExportData(fetcher.data.orders);
    }
  }, [fetcher.data]);

  const statusOptions = [
    { label: "Any Status", value: "any" },
    { label: "Open", value: "open" },
    { label: "Closed", value: "closed" },
    { label: "Cancelled", value: "cancelled" },
    { label: "Pending", value: "pending" },
    { label: "Authorized", value: "authorized" },
    { label: "Paid", value: "paid" },
    { label: "Partially Paid", value: "partially_paid" },
    { label: "Refunded", value: "refunded" },
    { label: "Partially Refunded", value: "partially_refunded" },
    { label: "Voided", value: "voided" }
  ];

  return (
    <Page>
      <TitleBar title="Orders Export" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Export Orders by Date Range
                </Text>
                <Text variant="bodyMd" as="p">
                  Export your Shopify orders within a specific date range. The app will automatically 
                  fetch all orders in batches to handle large date ranges (up to 5000 orders).
                </Text>

                <BlockStack gap="300">
                  <InlineStack gap="300" align="start">
                    <TextField
                      label="Start Date (YYYY-MM-DD)"
                      value={filters.dateFrom}
                      onChange={(value) => setFilters(prev => ({ ...prev, dateFrom: value }))}
                      placeholder="2024-01-01"
                      autoComplete="off"
                      required
                    />
                    <TextField
                      label="End Date (YYYY-MM-DD)"
                      value={filters.dateTo}
                      onChange={(value) => setFilters(prev => ({ ...prev, dateTo: value }))}
                      placeholder="2024-12-31"
                      autoComplete="off"
                      required
                    />
                  </InlineStack>

                  <InlineStack gap="300" align="start">
                    <div style={{ minWidth: "200px" }}>
                      <Select
                        label="Order status"
                        options={statusOptions}
                        value={filters.status}
                        onChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
                      />
                    </div>
                    <div style={{ minWidth: "200px" }}>
                      <Select
                        label="Export mode"
                        options={[
                          { label: "First 250 orders", value: "false" },
                          { label: "All orders (up to 5000)", value: "true" }
                        ]}
                        value={filters.exportAll.toString()}
                        onChange={(value) => setFilters(prev => ({ ...prev, exportAll: value === "true" }))}
                      />
                    </div>
                  </InlineStack>

                  <Button
                    primary
                    loading={isLoadingExport}
                    onClick={handleExport}
                    disabled={isLoadingExport || !filters.dateFrom || !filters.dateTo}
                  >
                    {isLoadingExport ? "Exporting..." : "Export Orders"}
                  </Button>
                </BlockStack>

                {fetcher.data?.success && exportData && (
                  <Banner status="success" title="Export completed successfully!">
                    <p>
                      Found {exportData.length} orders from {filters.dateFrom} to {filters.dateTo}.
                      {fetcher.data.totalBatches > 1 && ` Fetched in ${fetcher.data.totalBatches} batches.`}
                      {fetcher.data.hasMore && " There are more orders available. Consider using a smaller date range."}
                    </p>
                    <Button onClick={() => downloadCSV(exportData)}>
                      Download CSV
                    </Button>
                  </Banner>
                )}

                {fetcher.data?.success === false && (
                  <Banner status="critical" title="Export failed">
                    <p>{fetcher.data?.error || "There was an error exporting the orders. Please try again."}</p>
                  </Banner>
                )}
              </BlockStack>
            </Card>

            {exportData && exportData.length > 0 && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h3" variant="headingMd">
                    Export Preview ({exportData.length} orders)
                  </Text>
                  <Text variant="bodyMd" as="p">
                    Here's a preview of the exported data. Click "Download CSV" to get the complete export.
                  </Text>

                  <Box padding="400" background="bg-surface-active" borderRadius="200">
                    <DataTable
                      columnContentTypes={[
                        'text',
                        'text',
                        'text',
                        'text',
                        'text',
                        'numeric',
                        'numeric'
                      ]}
                      headings={[
                        'Order',
                        'Customer',
                        'Status',
                        'Total',
                        'Items',
                        'Products',
                        'Variants'
                      ]}
                      rows={exportData.slice(0, 10).map(order => [
                        order.order_name,
                        order.customer_name || 'Guest',
                        <Badge key={order.financial_status} status={order.financial_status === 'PAID' ? 'success' : 'info'}>
                          {order.financial_status}
                        </Badge>,
                        `${order.total_price} ${order.currency}`,
                        order.line_items.reduce((sum, item) => sum + item.quantity, 0),
                        order.line_items.filter(item => item.product_id).length,
                        order.line_items.filter(item => item.variant_id).length
                      ])}
                    />
                  </Box>

                  {exportData.length > 10 && (
                    <Text variant="bodyMd" as="p">
                      Showing first 10 orders. Download the full CSV to see all {exportData.length} orders.
                    </Text>
                  )}
                </BlockStack>
              </Card>
            )}
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Export Features
                  </Text>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd">
                      • <strong>Date Range Export:</strong> Export orders within specific dates
                    </Text>
                    <Text as="p" variant="bodyMd">
                      • <strong>Batch Processing:</strong> Automatically handles large datasets
                    </Text>
                    <Text as="p" variant="bodyMd">
                      • <strong>Product & Variant IDs:</strong> Complete product information
                    </Text>
                    <Text as="p" variant="bodyMd">
                      • <strong>CSV Format:</strong> Easy to import into spreadsheets
                    </Text>
                    <Text as="p" variant="bodyMd">
                      • <strong>Status Filtering:</strong> Filter by order status
                    </Text>
                  </BlockStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Export Limits
                  </Text>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd">
                      • <strong>Single Batch:</strong> Up to 250 orders
                    </Text>
                    <Text as="p" variant="bodyMd">
                      • <strong>Multiple Batches:</strong> Up to 5000 orders (20 batches)
                    </Text>
                    <Text as="p" variant="bodyMd">
                      • <strong>Date Range:</strong> Recommended max 30 days for large stores
                    </Text>
                    <Text as="p" variant="bodyMd">
                      • <strong>Rate Limiting:</strong> Built-in delays to avoid API limits
                    </Text>
                  </BlockStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    CSV Columns
                  </Text>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd">
                      The exported CSV includes these columns:
                    </Text>
                    <Text as="p" variant="bodyMd">
                      Order ID, Order Name, Created At, Financial Status, Fulfillment Status, Total Price, Currency, Customer ID, Customer Name, Customer Email, Line Item ID, Product ID, Product Title, Product Handle, Variant ID, Variant Title, Variant SKU, Variant Barcode, Quantity, Unit Price, Unit Price Currency
                    </Text>
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
} 