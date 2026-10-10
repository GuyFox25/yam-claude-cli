export const ORDERS_SRV = '/sap/opu/odata/sap/ZORDERS_SRV';

const escapeOData = (value: string): string => encodeURIComponent(value.replace(/'/g, "''"));

export const ordersUrl = (customer: string): string => `${ORDERS_SRV}/OrderSet?$filter=Customer eq '${escapeOData(customer)}'`;
