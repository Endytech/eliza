import {
    elizaLogger,
    IAgentRuntime,
} from "@elizaos/core";

export async function getCollectionItems(
    brnHost: string,
    collectionId: string,
    brnApiKey: string,
    offset?: number,
    limit?: number,
    sortField?: string,
    sortDirection?: string,
    viewed?: string,
): Promise<any> {
    let queryParams = `text_cut=false`;
    if (limit) queryParams += `&limit=${limit}`;
    if (offset) queryParams += `&offset=${offset}`;
    if (sortField) queryParams += `&sort_field=${sortField}`;
    if (sortDirection) queryParams += `&sort_direction=${sortDirection}`;
    if (viewed) queryParams += `&viewed=${viewed}`;
    const response = await fetch(
        `${brnHost}/items/${collectionId}?${queryParams}`,
        {
            method: "GET",
            headers: {
                "x-access-token": brnApiKey,
                "Content-Type": "application/json",
            },
        }
    );
    if (!response.ok) throw new Error(`Get Brn collection items request failed: ${response.statusText}`);
    const responseFetch = await response.json();
    if (!responseFetch.status) throw new Error(`Get Brn collection items failed: status ${responseFetch.status}, error - ${responseFetch.error}`);
    return responseFetch;
}

export async function setViewedCollectionItems(
    brnHost: string,
    itemId: string,
    brnApiKey: string,
): Promise<any> {
    const response = await fetch(
        `${brnHost}/item/${itemId}/view`,
        {
            method: "POST",
            headers: {
                "x-access-token": brnApiKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                viewed: true,
            }),
        }
    );
    if (!response.ok) throw new Error(`Set View for item: ${itemId}} of the Brn collection request failed: ${response.statusText}`);
    const responseFetch = await response.json();
    if (!responseFetch.status) throw new Error(`Set View for item: ${itemId}} of the Brn collection failed: status ${responseFetch.status}, error - ${responseFetch.error}`);
}

export const getBrnNews = async (
    data: {
    brnHost: string;
    collectionIds: string;
    brnApiKeys: string;
    offset?: number;
    fetchLimit?: number;
    sortField?: string;
    sortDirection?: string;
    setViewed?: boolean;
    viewed?: string;
    totalLimit?: number;
},
runtime: IAgentRuntime
): Promise<{
    success: boolean;
    data?: string;
    error?: any;
}> => {
    try {
        const collectionIdsArray = data.collectionIds.split(',').map(id => id.trim());
        const brnApiKeysArray = data.brnApiKeys.split(',').map(id => id.trim());
        elizaLogger.info("Get Brn collection with option:", data);

        const resultItems = [];
        for (const [index, collectionId] of collectionIdsArray.entries()) {
            try {
                const brnApiKey = brnApiKeysArray[index];
                const itemsFetch = await getCollectionItems(data.brnHost, collectionId, brnApiKey, data.offset, data.fetchLimit, data.sortField, data.sortDirection, data.viewed)
                if (itemsFetch.items && itemsFetch.items.length > 0) {
                    if (data.totalLimit) {
                        let spaceLeft = data.totalLimit - resultItems.length;
                        if (spaceLeft > 0) {
                            itemsFetch.items = itemsFetch.items.slice(0, spaceLeft);
                        } else {
                            itemsFetch.items = [];
                        }
                    }
                    const items = itemsFetch.items.map((item) => {
                        return {
                            title: item?.fields?.title,
                            description: item?.fields?.description,
                            date: item?.fields?.date
                        };
                    });
                    resultItems.push(...items);
                    if (data.setViewed) {
                        for (const item of itemsFetch.items) {
                            try {
                                await setViewedCollectionItems(data.brnHost, item.item_id, brnApiKey)
                            } catch (error) {
                                elizaLogger.warn(`Get Brn News collection '${collectionId}' failed set viewed:  Error - ${error}`);
                            }
                        }
                    }
                }
            } catch (error) {
                elizaLogger.warn(`Get Brn News collection '${collectionId}' failed:  Error - ${error}`)
            }
        }
        if (resultItems.length < 1) throw new Error(`Get empty Brn News of all collections`);
        return { success: true, data: JSON.stringify(resultItems) };
    } catch (error) {
        elizaLogger.warn(`Get Brn News failed. Error - ${error}`);
        return { success: false, error: error };
    }
}
