import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  DynamoDBClient,
  BatchWriteItemCommand,
  BatchWriteItemCommandInput,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
  QueryCommand,
  QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import {
  extractAuthContext,
  requirePermission,
  ForbiddenError,
  UnauthorizedError,
  NotFoundError,
  ValidationError,
  AuthContext,
} from './rbac';

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.MAIN_TABLE || 'EstimateAssessmentSystem';

interface AuditLog {
  pk: string;
  sk: string;
  userId: string;
  operationType: string;
  targetTable: string;
  targetRecordId?: string;
  operationDetails: string;
  operationStatus: string;
  errorMessage?: string;
  operationTimestamp: number;
  ipAddress?: string;
  sessionId?: string;
  createdAt: number;
}

interface User {
  pk: string;
  sk: string;
  userId: string;
  userName: string;
  email: string;
  passwordHash: string;
  role: string;
  status: string;
  department?: string;
  lastLoginAt?: number;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
}

interface Estimate {
  pk: string;
  sk: string;
  estimateId: string;
  userId: string;
  estimateNumber: string;
  estimateDate: number;
  expiryDate?: number;
  customerName: string;
  estimateAmount: number;
  assessmentStatus: string;
  autoJudgmentResult?: string;
  judgmentReason?: string;
  remarks?: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

interface OCRResult {
  pk: string;
  sk: string;
  ocrResultId: string;
  estimateId: string;
  userId: string;
  extractedText: string;
  estimateAmount?: number;
  taxAmount?: number;
  totalAmount?: number;
  extractionAccuracy?: number;
  processingStatus: string;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

interface PastProject {
  pk: string;
  sk: string;
  projectId: string;
  userId: string;
  estimateId: string;
  ocrResultId?: string;
  projectName: string;
  projectDescription?: string;
  estimateAmount: number;
  actualAmount?: number;
  autoAssessmentResult: string;
  autoAssessmentScore?: number;
  finalJudgmentResult: string;
  judgedBy?: string;
  judgmentReason?: string;
  projectStatus: string;
  industryClassification?: string;
  riskAssessment?: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

interface PriceMaster {
  pk: string;
  sk: string;
  priceMasterId: string;
  priceMasterName: string;
  issuedYearMonth: string;
  itemCode: string;
  itemName: string;
  unit: string;
  standardPrice: number;
  laborCost?: number;
  materialCost?: number;
  expense?: number;
  regionClassification?: string;
  remarks?: string;
  validFlag: boolean;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  updatedBy: string;
}

interface MarketData {
  pk: string;
  sk: string;
  marketDataId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  marketPrice: number;
  minPrice: number;
  maxPrice: number;
  region?: string;
  dataSource: string;
  applicableStartDate: number;
  applicableEndDate?: number;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  updatedBy?: string;
}

interface DeviationAnalysis {
  pk: string;
  sk: string;
  deviationAnalysisId: string;
  estimateId: string;
  analysisTargetItem: string;
  estimateValue: number;
  referenceValue: number;
  referenceDataType: string;
  deviationRate: number;
  deviationAmount: number;
  deviationJudgment: string;
  deviationReason?: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

interface AutoJudgmentResult {
  pk: string;
  sk: string;
  judgmentResultId: string;
  estimateId: string;
  userId: string;
  judgmentStatus: string;
  judgmentReason: string;
  deviationAnalysisId?: string;
  marketComparisonRate?: number;
  pastProjectReferenceCount?: number;
  priceMasterReferenceFlag?: boolean;
  judgmentScore?: number;
  manualConfirmationRequired: boolean;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

interface AssessorJudgmentResult {
  pk: string;
  sk: string;
  assessorJudgmentResultId: string;
  estimateId: string;
  assessorId: string;
  autoJudgmentResultId?: string;
  judgmentStatus: string;
  judgmentAmount?: number;
  judgmentComment?: string;
  deviationFlag: boolean;
  deviationReason?: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

interface JudgmentDifference {
  pk: string;
  sk: string;
  judgmentDifferenceId: string;
  estimateId: string;
  autoJudgmentResultId: string;
  assessorJudgmentResultId: string;
  differenceType: string;
  autoJudgmentAmount: number;
  assessorJudgmentAmount: number;
  differenceAmount: number;
  differenceRate?: number;
  autoJudgmentBasis?: string;
  assessorJudgmentBasis?: string;
  differenceCauseClassification?: string;
  improvementProposal?: string;
  status: string;
  createdAt: number;
  createdBy: string;
  updatedAt?: number;
  updatedBy?: string;
}

interface MarketJudgmentLogic {
  pk: string;
  sk: string;
  marketJudgmentLogicId: string;
  constructionTypeCode: string;
  regionCode: string;
  applicableStartDate: number;
  applicableEndDate?: number;
  lowerLimitCoefficient: number;
  upperLimitCoefficient: number;
  referenceMarketDataId: string;
  judgmentRuleDescription?: string;
  validFlag: boolean;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  updatedBy: string;
}

interface LogicTrialVerification {
  pk: string;
  sk: string;
  trialVerificationResultId: string;
  marketJudgmentLogicId: string;
  pastProjectDataId: string;
  logicVersionNumber: string;
  autoJudgmentResultId?: string;
  assessorJudgmentResultId?: string;
  predictedValue: number;
  actualValue: number;
  deviationAmount: number;
  deviationRate: string;
  judgmentMatchFlag: boolean;
  accuracyEvaluation: string;
  trialVerificationDateTime: number;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

interface DashboardAggregation {
  pk: string;
  sk: string;
  aggregationDataId: string;
  aggregationDateTime: number;
  aggregationGranularity: string;
  processedEstimateCount: number;
  autoJudgmentSuccessCount: number;
  autoJudgmentFailureCount: number;
  assessorJudgmentCount: number;
  autoJudgmentAccuracyRate: number;
  averageDeviationRate: number;
  deviationCount: number;
  ocrReadSuccessRate: number;
  averageProcessingTimeSeconds: number;
  marketDeviationCount: number;
  requiresConfirmationCount: number;
  logicTrialVerificationCount: number;
  logicImprovementProposalCount: number;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

interface OperationLog {
  pk: string;
  sk: string;
  operationLogId: string;
  userId: string;
  operationType: string;
  targetTableName: string;
  targetRecordId?: string;
  operationDetailContent?: string;
  operationStatus: string;
  errorMessage?: string;
  operationExecutionDateTime: number;
  ipAddress?: string;
  sessionId?: string;
  createdAt: number;
}

const TABLE_CONFIGS: Record<string, { pk: string; sk: string }> = {
  '0': { pk: 'USER', sk: 'userId' },
  '1': { pk: 'ESTIMATE', sk: 'estimateId' },
  '2': { pk: 'OCR_RESULT', sk: 'ocrResultId' },
  '3': { pk: 'PAST_PROJECT', sk: 'projectId' },
  '4': { pk: 'PRICE_MASTER', sk: 'priceMasterId' },
  '5': { pk: 'MARKET_DATA', sk: 'marketDataId' },
  '6': { pk: 'DEVIATION_ANALYSIS', sk: 'deviationAnalysisId' },
  '7': { pk: 'AUTO_JUDGMENT', sk: 'judgmentResultId' },
  '8': { pk: 'ASSESSOR_JUDGMENT', sk: 'assessorJudgmentResultId' },
  '9': { pk: 'JUDGMENT_DIFFERENCE', sk: 'judgmentDifferenceId' },
  '10': { pk: 'MARKET_LOGIC', sk: 'marketJudgmentLogicId' },
  '11': { pk: 'LOGIC_TRIAL', sk: 'trialVerificationResultId' },
  '12': { pk: 'DASHBOARD_AGG', sk: 'aggregationDataId' },
  '13': { pk: 'OPERATION_LOG', sk: 'operationLogId' },
};

async function createAuditLog(
  userId: string,
  operationType: string,
  targetTable: string,
  targetRecordId: string | undefined,
  operationDetails: string,
  operationStatus: string,
  errorMessage?: string,
  ipAddress?: string,
  sessionId?: string
): Promise<void> {
  const auditLog: AuditLog = {
    pk: 'AUDIT',
    sk: `${Date.now()}_${randomUUID()}`,
    userId,
    operationType,
    targetTable,
    targetRecordId,
    operationDetails,
    operationStatus,
    errorMessage,
    operationTimestamp: Date.now(),
    ipAddress,
    sessionId,
    createdAt: Date.now(),
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: auditLog,
    })
  );
}

function validateRequiredFields(item: Record<string, unknown>, requiredFields: string[]): void {
  for (const field of requiredFields) {
    if (item[field] === undefined || item[field] === null || item[field] === '') {
      throw new ValidationError(`Required field missing: ${field}`);
    }
  }
}

function buildResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}

async function handleGetResources(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const authContext = extractAuthContext(event);
    if (!authContext) {
      throw new UnauthorizedError('Missing or invalid authorization');
    }

    requirePermission(authContext.role, 'read:all');

    const result = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        Limit: 100,
      })
    );

    return buildResponse(200, {
      success: true,
      data: result.Items || [],
      count: result.Items?.length || 0,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return buildResponse(401, { error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return buildResponse(403, { error: error.message });
    }
    return buildResponse(500, { error: 'Internal server error' });
  }
}

async function handleBulkImport(
  event: APIGatewayProxyEvent,
  tableIndex: string
): Promise<APIGatewayProxyResult> {
  try {
    const authContext = extractAuthContext(event);
    if (!authContext) {
      throw new UnauthorizedError('Missing or invalid authorization');
    }

    requirePermission(authContext.role, 'bulk:import');

    const tableConfig = TABLE_CONFIGS[tableIndex];
    if (!tableConfig) {
      throw new ValidationError(`Invalid table index: ${tableIndex}`);
    }

    const body = JSON.parse(event.body || '{}');
    const items = body.items as Record<string, unknown>[];

    if (!Array.isArray(items) || items.length === 0) {
      throw new ValidationError('items must be a non-empty array');
    }

    const now = Date.now();
    const enrichedItems = items.map((item) => ({
      ...item,
      pk: tableConfig.pk,
      sk: item[tableConfig.sk] || randomUUID(),
      id: item.id || randomUUID(),
      createdAt: now,
      updatedAt: now,
      createdBy: authContext.userId,
    }));

    const chunks: Record<string, unknown>[][] = [];
    for (let i = 0; i < enrichedItems.length; i += 25) {
      chunks.push(enrichedItems.slice(i, i + 25));
    }

    let imported = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const chunk of chunks) {
      const writeRequests = chunk.map((item) => ({
        PutRequest: {
          Item: item,
        },
      }));

      try {
        const batchInput: BatchWriteItemCommandInput = {
          RequestItems: {
            [TABLE_NAME]: writeRequests,
          },
        };

        await client.send(new BatchWriteItemCommand(batchInput));
        imported += chunk.length;
      } catch (error) {
        failed += chunk.length;
        errors.push(`Batch write failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    await createAuditLog(
      authContext.userId,
      'BULK_IMPORT',
      tableConfig.pk,
      undefined,
      `Bulk imported ${imported} items to ${tableConfig.pk}`,
      'success',
      undefined,
      event.requestContext?.identity?.sourceIp,
      event.requestContext?.requestId
    );

    return buildResponse(200, {
      success: true,
      imported,
      failed,
      errors,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return buildResponse(401, { error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return buildResponse(403, { error: error.message });
    }
    if (error instanceof ValidationError) {
      return buildResponse(400, { error: error.message });
    }
    return buildResponse(500, { error: 'Internal server error' });
  }
}

async function handleGetItem(
  event: APIGatewayProxyEvent,
  tableIndex: string
): Promise<APIGatewayProxyResult> {
  try {
    const authContext = extractAuthContext(event);
    if (!authContext) {
      throw new UnauthorizedError('Missing or invalid authorization');
    }

    requirePermission(authContext.role, 'read:all');

    const tableConfig = TABLE_CONFIGS[tableIndex];
    if (!tableConfig) {
      throw new ValidationError(`Invalid table index: ${tableIndex}`);
    }

    const itemId = event.pathParameters?.id;
    if (!itemId) {
      throw new ValidationError('Missing id parameter');
    }

    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: tableConfig.pk,
          sk: itemId,
        },
      })
    );

    if (!result.Item) {
      throw new NotFoundError(`Item not found: ${itemId}`);
    }

    return buildResponse(200, {
      success: true,
      data: result.Item,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return buildResponse(401, { error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return buildResponse(403, { error: error.message });
    }
    if (error instanceof NotFoundError) {
      return buildResponse(404, { error: error.message });
    }
    if (error instanceof ValidationError) {
      return buildResponse(400, { error: error.message });
    }
    return buildResponse(500, { error: 'Internal server error' });
  }
}

async function handleCreateItem(
  event: APIGatewayProxyEvent,
  tableIndex: string
): Promise<APIGatewayProxyResult> {
  try {
    const authContext = extractAuthContext(event);
    if (!authContext) {
      throw new UnauthorizedError('Missing or invalid authorization');
    }

    requirePermission(authContext.role, 'write:all');

    const tableConfig = TABLE_CONFIGS[tableIndex];
    if (!tableConfig) {
      throw new ValidationError(`Invalid table index: ${tableIndex}`);
    }

    const body = JSON.parse(event.body || '{}');
    const now = Date.now();

    const item = {
      ...body,
      pk: tableConfig.pk,
      sk: body[tableConfig.sk] || randomUUID(),
      id: body.id || randomUUID(),
      createdAt: now,
      updatedAt: now,
      createdBy: authContext.userId,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
      })
    );

    await createAuditLog(
      authContext.userId,
      'CREATE',
      tableConfig.pk,
      item.sk,
      JSON.stringify(item),
      'success',
      undefined,
      event.requestContext?.identity?.sourceIp,
      event.requestContext?.requestId
    );

    return buildResponse(201, {
      success: true,
      data: item,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return buildResponse(401, { error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return buildResponse(403, { error: error.message });
    }
    if (error instanceof ValidationError) {
      return buildResponse(400, { error: error.message });
    }
    return buildResponse(500, { error: 'Internal server error' });
  }
}

async function handleUpdateItem(
  event: APIGatewayProxyEvent,
  tableIndex: string
): Promise<APIGatewayProxyResult> {
  try {
    const authContext = extractAuthContext(event);
    if (!authContext) {
      throw new UnauthorizedError('Missing or invalid authorization');
    }

    requirePermission(authContext.role, 'write:all');

    const tableConfig = TABLE_CONFIGS[tableIndex];
    if (!tableConfig) {
      throw new ValidationError(`Invalid table index: ${tableIndex}`);
    }

    const itemId = event.pathParameters?.id;
    if (!itemId) {
      throw new ValidationError('Missing id parameter');
    }

    const body = JSON.parse(event.body || '{}');
    const now = Date.now();

    const updateExpressionParts: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(body)) {
      if (key !== 'pk' && key !== 'sk' && key !== 'id' && key !== 'createdAt' && key !== 'createdBy') {
        updateExpressionParts.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = value;
      }
    }

    updateExpressionParts.push('#updatedAt = :updatedAt');
    updateExpressionParts.push('#updatedBy = :updatedBy');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeNames['#updatedBy'] = 'updatedBy';
    expressionAttributeValues[':updatedAt'] = now;
    expressionAttributeValues[':updatedBy'] = authContext.userId;

    const result = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: tableConfig.pk,
          sk: itemId,
        },
        UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      })
    );

    await createAuditLog(
      authContext.userId,
      'UPDATE',
      tableConfig.pk,
      itemId,
      JSON.stringify(body),
      'success',
      undefined,
      event.requestContext?.identity?.sourceIp,
      event.requestContext?.requestId
    );

    return buildResponse(200, {
      success: true,
      data: result.Attributes,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return buildResponse(401, { error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return buildResponse(403, { error: error.message });
    }
    if (error instanceof ValidationError) {
      return buildResponse(400, { error: error.message });
    }
    return buildResponse(500, { error: 'Internal server error' });
  }
}

async function handleDeleteItem(
  event: APIGatewayProxyEvent,
  tableIndex: string
): Promise<APIGatewayProxyResult> {
  try {
    const authContext = extractAuthContext(event);
    if (!authContext) {
      throw new UnauthorizedError('Missing or invalid authorization');
    }

    requirePermission(authContext.role, 'delete:all');

    const tableConfig = TABLE_CONFIGS[tableIndex];
    if (!tableConfig) {
      throw new ValidationError(`Invalid table index: ${tableIndex}`);
    }

    const itemId = event.pathParameters?.id;
    if (!itemId) {
      throw new ValidationError('Missing id parameter');
    }

    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: tableConfig.pk,
          sk: itemId,
        },
      })
    );

    await createAuditLog(
      authContext.userId,
      'DELETE',
      tableConfig.pk,
      itemId,
      `Deleted item ${itemId}`,
      'success',
      undefined,
      event.requestContext?.identity?.sourceIp,
      event.requestContext?.requestId
    );

    return buildResponse(200, {
      success: true,
      message: 'Item deleted successfully',
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return buildResponse(401, { error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return buildResponse(403, { error: error.message });
    }
    if (error instanceof ValidationError) {
      return buildResponse(400, { error: error.message });
    }
    return buildResponse(500, { error: 'Internal server error' });
  }
}

async function handleListItems(
  event: APIGatewayProxyEvent,
  tableIndex: string
): Promise<APIGatewayProxyResult> {
  try {
    const authContext = extractAuthContext(event);
    if (!authContext) {
      throw new UnauthorizedError('Missing or invalid authorization');
    }

    requirePermission(authContext.role, 'read:all');

    const tableConfig = TABLE_CONFIGS[tableIndex];
    if (!tableConfig) {
      throw new ValidationError(`Invalid table index: ${tableIndex}`);
    }

    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 100;
    const lastEvaluatedKey = event.queryStringParameters?.lastEvaluatedKey
      ? JSON.parse(event.queryStringParameters.lastEvaluatedKey)
      : undefined;

    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': tableConfig.pk,
        },
        Limit: limit,
        ExclusiveStartKey: lastEvaluatedKey,
      } as QueryCommandInput)
    );

    return buildResponse(200, {
      success: true,
      data: result.Items || [],
      count: result.Items?.length || 0,
      lastEvaluatedKey: result.LastEvaluatedKey,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return buildResponse(401, { error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return buildResponse(403, { error: error.message });
    }
    if (error instanceof ValidationError) {
      return buildResponse(400, { error: error.message });
    }
    return buildResponse(500, { error: 'Internal server error' });
  }
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const path = event.path || '';
  const method = event.httpMethod || 'GET';

  try {
    if (path === '/resources' && method === 'GET') {
      return await handleGetResources(event);
    }

    const bulkMatch = path.match(/^\/api\/(\d+)\/bulk$/);
    if (bulkMatch && method === 'POST') {
      return await handleBulkImport(event, bulkMatch[1]);
    }

    const getMatch = path.match(/^\/api\/(\d+)\/(.*?)$/);
    if (getMatch && method === 'GET' && getMatch[2]) {
      return await handleGetItem(event, getMatch[1]);
    }

    const listMatch = path.match(/^\/api\/(\d+)$/);
    if (listMatch && method === 'GET') {
      return await handleListItems(event, listMatch[1]);
    }

    if (listMatch && method === 'POST') {
      return await handleCreateItem(event, listMatch[1]);
    }

    const updateMatch = path.match(/^\/api\/(\d+)\/(.*?)$/);
    if (updateMatch && method === 'PUT') {
      return await handleUpdateItem(event, updateMatch[1]);
    }

    const deleteMatch = path.match(/^\/api\/(\d+)\/(.*?)$/);
    if (deleteMatch && method === 'DELETE') {
      return await handleDeleteItem(event, deleteMatch[1]);
    }

    return buildResponse(404, { error: 'Not found' });
  } catch (error) {
    console.error('Unhandled error:', error);
    return buildResponse(500, { error: 'Internal server error' });
  }
};