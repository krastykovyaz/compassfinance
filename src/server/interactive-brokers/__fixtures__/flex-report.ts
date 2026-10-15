// A hand-written Flex report in the shape Interactive Brokers documents,
// covering every section CompassFinance asks for, plus the rows and levels
// the parser must skip. The AccountInformation element deliberately carries
// personal data (a query set up with "Select All" would): none of it may
// ever reach the parsed report.
export const FLEX_REPORT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<FlexQueryResponse queryName="CompassFinance" type="AF">
<FlexStatements count="1">
<FlexStatement accountId="U1234567" fromDate="20251007" toDate="20261007" period="Last365CalendarDays" whenGenerated="20261008;061500">
<AccountInformation accountId="U1234567" acctAlias="Main" currency="EUR" name="Jane Q. Doe" accountType="Individual" street="12 Example Road" city="Dublin" postalCode="D01 X000" dateOfBirth="19900101" primaryEmail="jane@example.com" />
<CashReport>
<CashReportCurrency accountId="U1234567" currency="BASE_SUMMARY" levelOfDetail="BaseCurrency" endingCash="1500.25" endingSettledCash="1500.25" />
<CashReportCurrency accountId="U1234567" currency="USD" levelOfDetail="Currency" endingCash="500" endingSettledCash="500" />
</CashReport>
<EquitySummaryInBase>
<EquitySummaryByReportDateInBase accountId="U1234567" reportDate="20261006" cash="1000" stock="5000" total="6000" />
<EquitySummaryByReportDateInBase accountId="U1234567" reportDate="20261007" cash="1500.25" stock="9123.75" total="10624" />
</EquitySummaryInBase>
<OpenPositions>
<OpenPosition accountId="U1234567" currency="USD" fxRateToBase="0.92" assetCategory="STK" symbol="AAPL" description="APPLE INC" conid="265598" multiplier="1" position="10" markPrice="200" positionValue="2000" costBasisPrice="150" fifoPnlUnrealized="500" levelOfDetail="SUMMARY" reportDate="20261007" side="Long" />
<OpenPosition accountId="U1234567" currency="USD" fxRateToBase="0.92" assetCategory="STK" symbol="TSLA" description="TESLA &amp; CO" conid="76792991" multiplier="1" position="-5" markPrice="250" positionValue="-1250" costBasisPrice="260" fifoPnlUnrealized="-50" levelOfDetail="SUMMARY" reportDate="20261007" side="Short" />
<OpenPosition accountId="U1234567" currency="USD" fxRateToBase="0.92" assetCategory="STK" symbol="AAPL" description="APPLE INC" conid="265598" position="6" markPrice="200" levelOfDetail="LOT" />
<OpenPosition accountId="U1234567" currency="USD" assetCategory="STK" symbol="ZERO" conid="1" position="0" levelOfDetail="SUMMARY" />
<OpenPosition accountId="U9999999" currency="USD" assetCategory="STK" symbol="OTHER" conid="2" position="3" levelOfDetail="SUMMARY" />
</OpenPositions>
<Trades>
<Trade accountId="U1234567" currency="USD" assetCategory="STK" symbol="AAPL" description="APPLE INC" conid="265598" tradeID="111" dateTime="20260105;093000" buySell="BUY" quantity="10" tradePrice="150" tradeMoney="1500" levelOfDetail="EXECUTION" />
<Trade accountId="U1234567" currency="USD" assetCategory="STK" symbol="AAPL" description="APPLE INC" conid="265598" tradeID="112" dateTime="20260301;154500" buySell="SELL" quantity="-4" tradePrice="190" tradeMoney="-760" levelOfDetail="EXECUTION" />
<Trade accountId="U1234567" currency="USD" assetCategory="STK" symbol="AAPL" conid="265598" tradeID="113" dateTime="20260301;154500" buySell="SELL" quantity="-4" levelOfDetail="ORDER" />
</Trades>
<CashTransactions>
<CashTransaction accountId="U1234567" currency="USD" assetCategory="STK" symbol="AAPL" conid="265598" type="Dividends" transactionID="900" dateTime="20260215;202500" amount="2.4" description="AAPL CASH DIVIDEND" levelOfDetail="DETAIL" />
<CashTransaction accountId="U1234567" currency="EUR" type="Deposits/Withdrawals" transactionID="901" dateTime="20260110;120000" amount="1000" description="CASH RECEIPTS" levelOfDetail="DETAIL" />
<CashTransaction accountId="U1234567" currency="EUR" type="Other Fees" transactionID="902" dateTime="20260120;120000" amount="-1" description="MARKET DATA" levelOfDetail="DETAIL" />
<CashTransaction accountId="U1234567" currency="EUR" type="Dividends" transactionID="999" dateTime="20260215;202500" amount="2.4" levelOfDetail="SUMMARY" />
</CashTransactions>
<Transfers>
<Transfer accountId="U1234567" currency="EUR" type="INTERNAL" direction="OUT" cashTransfer="-200" transactionID="950" date="20260301" dateTime="20260301;100000" />
</Transfers>
</FlexStatement>
</FlexStatements>
</FlexQueryResponse>`;
