import axios from "axios";

export async function fetchScripts() {
  try {
    const url =
      "https://dps.psx.com.pk/symbols";
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error("Error fetching all scripts:", error.message);
    throw new Error("Failed to fetch scripts");
  }
}
