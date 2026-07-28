import axios from "axios";

export async function fetchScripts() {
  try {
    const response = await axios.get(
      "https://beta-restapi.sarmaaya.pk/api/stocks/listing?limit=1000"
    );

    return response.data.response.data;
  } catch (error) {
    console.error(
      "Error fetching scripts:",
      error.response?.data || error.message
    );
    throw new Error("Failed to fetch scripts");
  }
}
