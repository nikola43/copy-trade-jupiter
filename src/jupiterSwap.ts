import axios from "axios";
import dotenv from "dotenv";
const { HttpsProxyAgent } = require('https-proxy-agent');
dotenv.config();

const proxyUrl = process.env.PROXY_URL;
const agent = new HttpsProxyAgent(proxyUrl);

interface SwapInfo {
    ammKey: string;
    label: string;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    feeAmount: string;
    feeMint: string;
}

interface RoutePlan {
    swapInfo: SwapInfo;
    percent: number;
}

interface QuoteResponse {
    inputMint: string;
    inAmount: string;
    outputMint: string;
    outAmount: string;
    otherAmountThreshold: string;
    swapMode: string;
    slippageBps: number;
    platformFee: string | null;
    priceImpactPct: string;
    routePlan: RoutePlan[];
    scoreReport: string | null;
    contextSlot: number;
    timeTaken: number;
    swapUsdValue: string;
    simplerRouteUsed: boolean;
}

export const getQuote = async (inputMint: string, outputMint: string, amount: number, slippageBps: number, restrictIntermediateTokens: boolean): Promise<QuoteResponse> => {



    const quoteResponse = await axios.get(
        'https://api.jup.ag/swap/v1/quote', {
        params: {
            inputMint,
            outputMint,
            amount,
            slippageBps,
            restrictIntermediateTokens
        },
        httpAgent: agent,
        httpsAgent: agent
    });

    return quoteResponse.data;
}

export const performSwap = async (quoteResponse: QuoteResponse, walletAddress: string) => {
    try {
        const response = await axios.post(
            'https://api.jup.ag/swap/v1/swap',
            {
                quoteResponse,
                userPublicKey: walletAddress,
                // ADDITIONAL PARAMETERS TO OPTIMIZE FOR TRANSACTION LANDING
                dynamicComputeUnitLimit: true,
                dynamicSlippage: true,
                prioritizationFeeLamports: {
                    priorityLevelWithMaxLamports: {
                        maxLamports: 1000000,
                        priorityLevel: "veryHigh"
                    }
                }
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    // 'x-api-key': '' // enter api key here
                },
                httpAgent: agent,
                httpsAgent: agent
            }
        );

        // console.log(response.data);
        return response.data;
    } catch (error) {
        console.error('Error performing swap:', error);
        throw error;
    }
}
