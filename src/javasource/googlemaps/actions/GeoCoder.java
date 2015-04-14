package googlemaps.actions;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.URL;
import java.net.URLEncoder;
import java.security.AccessControlException;

import org.json.JSONArray;
import org.json.JSONObject;

public class GeoCoder {
	private final static String ENCODING = "UTF-8";
	private final static String STATUS_OK = "OK"; //indicates that no errors occurred; the address was successfully parsed and at least one geocode was returned.
	private final static String STATUS_ZERO_RESULTS ="ZERO_RESULTS"; //indicates that the geocode was successful but returned no results. This may occur if the geocode was passed a non-existent address or a latlng in a remote location.
	private final static String STATUS_OVER_QUERY_LIMIT ="OVER_QUERY_LIMIT"; //indicates that you are over your quota.
	private final static String STATUS_REQUEST_DENIED ="REQUEST_DENIED"; //indicates that your request was denied, generally because of lack of a sensor parameter.
	private final static String STATUS_INVALID_REQUEST ="INVALID_REQUEST"; //generally indicates that the query (address or latlng) is missing.
	private final static String STATUS_UNKNOWN_ERROR = "UNKNOWN_ERROR"; //indicates that the request could not be processed due to a server error. The request may succeed if you try again.
	
	
	public static class Location {
		public Double lon, lat;
		
		private Location (Double lat, Double lon) {
			this.lon = lon;
			this.lat = lat;
		}
		
		public String toString() {
			return "Lat: "+lat+", Lon: "+lon;
		}
	}
	
	public static Location getLocation (String address) throws IOException {
		
		StringBuilder sb = new StringBuilder();
		Location location = null;
		
		
		BufferedReader in = new BufferedReader (
			new InputStreamReader (
				new URL ("https://maps.googleapis.com/maps/api/geocode/json?address="+URLEncoder.encode (address, ENCODING)+"&sensor=false")
				.openStream ()
			)
		);
		String line;
		
		int statusCode = -1;
		while ((line = in.readLine ()) != null) {
			sb.append(line);	
		}
		
		in.close();
				
		
		JSONObject json = new JSONObject(sb.toString());
		
		JSONArray jsonresults = (json.getJSONArray("results"));
		
		String  jsonstatus = (json.getString("status"));
		
		if(jsonstatus.equals(STATUS_OK))
		{
		
			if(jsonresults.length()>0)
			{
			
				JSONObject jsongeometry = (jsonresults.getJSONObject(0).getJSONObject("geometry"));
				
				if(!jsongeometry.equals(null))
				{
					JSONObject jsonlocation = (jsongeometry.getJSONObject("location"));
				
					location = new Location (
							(jsonlocation.getDouble("lat")),
							(jsonlocation.getDouble("lng")));
				}
			}
		}
		else{
			if(jsonstatus.equals(STATUS_OVER_QUERY_LIMIT)) throw new IOException("GEOCODE request failed: you are over your quota");
			else if(jsonstatus.equals(STATUS_ZERO_RESULTS)) throw new IOException("The geocode request was successful but returned no results");
			else if(jsonstatus.equals(STATUS_REQUEST_DENIED)) throw new IOException("The geocode request is denied");
			else if(jsonstatus.equals(STATUS_INVALID_REQUEST)) throw new IOException("The geocode request is invalid (generally indicates that the query (address or latlng) is missing)");
			else if(jsonstatus.equals(STATUS_UNKNOWN_ERROR)) throw new IOException("The geocode request was not succesfull due to a google server error. The request may succeed if you try again.");
		}
		
		if (location == null) {
			switch (statusCode) {
				case 400: throw new IOException ("Bad Request");
				case 500: throw new IOException ("Unknown error from Google Encoder");
				case 601: throw new IOException ("Missing query");
				case 602: throw new IOException ("Address could not be found");
				case 603: throw new IOException ("Legal problem");
				case 604: throw new IOException ("No route");
				case 610: throw new IOException ("Bad key");
				case 620: throw new IOException ("Too many queries");
			}
		}
		return location;
		
	}
}