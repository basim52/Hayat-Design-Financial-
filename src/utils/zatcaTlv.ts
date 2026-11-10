import QRCode from 'qrcode';

/**
 * Encodes string to UTF-8 bytes and builds TLV tag structure:
 * Tag (1 byte) | Length (1 byte) | Value (bytes)
 */
function toTLVTag(tagNum: number, value: string): Uint8Array {
  const encoder = new TextEncoder();
  const valBytes = encoder.encode(value);
  const len = valBytes.length;
  const tagBytes = new Uint8Array(2 + len);
  tagBytes[0] = tagNum;
  tagBytes[1] = len;
  tagBytes.set(valBytes, 2);
  return tagBytes;
}

/**
 * Builds the standard TLV (Tag-Length-Value) Base64 string:
 * 1. Seller Name
 * 2. Tax / VAT Number
 * 3. Timestamp (ISO 8601)
 * 4. Invoice Total (with VAT)
 * 5. VAT Amount
 */
export function buildZatcaTLVBase64(
  sellerName: string,
  vatNumber: string,
  timestamp: string,
  totalWithVat: string | number,
  vatAmount: string | number
): string {
  const t1 = toTLVTag(1, sellerName || 'متجر حياة');
  const t2 = toTLVTag(2, vatNumber || '');
  const t3 = toTLVTag(3, timestamp || new Date().toISOString());
  const t4 = toTLVTag(4, typeof totalWithVat === 'number' ? totalWithVat.toFixed(2) : String(totalWithVat));
  const t5 = toTLVTag(5, typeof vatAmount === 'number' ? vatAmount.toFixed(2) : String(vatAmount));

  const totalLength = t1.length + t2.length + t3.length + t4.length + t5.length;
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  [t1, t2, t3, t4, t5].forEach(t => {
    combined.set(t, offset);
    offset += t.length;
  });

  let binary = '';
  for (let i = 0; i < combined.length; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return btoa(binary);
}

/**
 * Generates QR code DataURL for the invoice using the TLV base64 data
 */
export async function generateInvoiceQRCodeDataURL(
  sellerName: string,
  vatNumber: string,
  dateStr: string,
  grandTotal: number,
  taxAmount: number
): Promise<string> {
  try {
    let isoTime = new Date().toISOString();
    if (dateStr) {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        isoTime = parsed.toISOString();
      }
    }

    const tlvBase64 = buildZatcaTLVBase64(
      sellerName,
      vatNumber,
      isoTime,
      grandTotal,
      taxAmount
    );

    return await QRCode.toDataURL(tlvBase64, {
      width: 140,
      margin: 1,
      color: {
        dark: '#1E1B4B',
        light: '#FFFFFF'
      }
    });
  } catch (err) {
    console.error('Failed to generate invoice QR code:', err);
    return '';
  }
}
