import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import dotenv from "dotenv";
import express, { Request, Response } from "express";
import { getQuote, performSwap } from "./jupiterSwap";

const cors = require('cors');
dotenv.config();

const main = async () => {

    const RPC_URL = process.env.RPC_URL;
    if (!RPC_URL) {
        throw new Error('RPC_URL is required');
    }

    const FEE_PAYER_KEYPAIR = process.env.FEE_PAYER_KEYPAIR;
    if (!FEE_PAYER_KEYPAIR) {
        throw new Error('FEE_PAYER_KEY is required');
    }

    const API_KEY = process.env.API_KEY;
    if (!API_KEY) {
        throw new Error('API_KEY is required');
    }

    const feePayerKeypair = Keypair.fromSecretKey(bs58.decode(FEE_PAYER_KEYPAIR));

    const rpcUrl = RPC_URL;
    const connection = new Connection(rpcUrl);

    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    app.use(
        cors({
            //origin: 'https:website.com'
            origin: "*",
        })
    );

    app.get("/", (request: Request, response: Response) => {
        response.send('Hello World');
    });

    app.get("/trade", async (request: Request, response: Response) => {
        // get api key from query
        const apiKey = request.query.apiKey;
        if (!apiKey) {
            response.status(400).send('apiKey is required');
            return;
        }

        if (apiKey !== API_KEY) {
            response.status(401).send('Invalid apiKey');
            return;
        }

        // get signature from query
        const inputMint = request.query.inputMint;
        if (!inputMint) {
            response.status(400).send('inputMint is required');
            return;
        }

        // get outputMint from query
        const outputMint = request.query.outputMint;
        if (!outputMint) {
            response.status(400).send('outputMint is required');
            return;
        }

        const amount = request.query.amount;
        if (!amount) {
            response.status(400).send('amount is required');
            return;
        }

        const slippageBps = request.query.slippageBps;
        if (!slippageBps) {
            response.status(400).send('slippageBps is required');
            return;
        }

        console.log('apiKey:', apiKey);

        console.log("Transaction details: ", {
            inputMint,
            outputMint,
            amount,
            slippageBps
        });

        let txSignature = ""
        let txSuccess = false;
        let message = "";
        try {
            const quoteResponse = await getQuote(inputMint.toString(), outputMint.toString(), Number(amount), Number(slippageBps), false);
            if (!quoteResponse) {
                response.status(500).send('Failed to get quote');
                return;
            }

            const swapResponse = await performSwap(quoteResponse, feePayerKeypair.publicKey.toBase58());
            if (!swapResponse) {
                response.status(500).send('Failed to perform swap');
                return;
            }

            const transactionBase64 = swapResponse.swapTransaction
            const transaction = VersionedTransaction.deserialize(Buffer.from(transactionBase64, 'base64'));
            transaction.sign([feePayerKeypair]);
            const transactionBinary = transaction.serialize();


            const simulationResult = await connection.simulateTransaction(transaction, { commitment: "processed" });
            // console.log(simulationResult);

            if (simulationResult.value.err) {
                console.error("Simulation error for transaction:", simulationResult);
                console.error("Simulation error for transaction:", simulationResult.value.err);
            } else {
                console.log("Simulation success for transaction. Logs:");
                simulationResult.value.logs?.forEach(log => console.log(log));
                console.log("Sending transaction...");

                const signature = await connection.sendRawTransaction(transactionBinary, {
                    maxRetries: 2,
                    skipPreflight: true
                });
                const confirmation = await connection.confirmTransaction(signature, "finalized");
                txSignature = signature;
                if (confirmation.value.err) {
                    txSuccess = false;
                    message = `Transaction failed: ${JSON.stringify(confirmation.value.err)}\nhttps://solscan.io/tx/${signature}/`;
                    console.log(`Transaction failed: ${JSON.stringify(confirmation.value.err)}\nhttps://solscan.io/tx/${signature}/`);
                } else {
                    txSuccess = true;
                    message = `Transaction successful: https://solscan.io/tx/${signature}/`;
                    console.log(`Transaction successful: https://solscan.io/tx/${signature}/`);
                }
            }
        } catch (error) {
            console.error("Error during simulation:", error);
        }

        const result = {
            txSignature,
            txSuccess,
            message
        }

        response.send(result);
    });

    app.listen(1943, () => {
        console.log("Server running at PORT: ", 1943);
    }).on("error", (error) => {
        // gracefully handle error
        throw new Error(error.message);
    });
}



main().then(() => {
    console.log('done');
}).catch((err) => {
    console.error(err);
});