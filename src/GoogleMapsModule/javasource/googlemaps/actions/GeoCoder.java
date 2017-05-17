package googlemaps.actions;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.URL;
import java.net.URLEncoder;

import com.mendix.core.Core;
import com.mendix.core.conf.Configuration;
import com.mendix.thirdparty.org.json.JSONArray;
import com.mendix.thirdparty.org.json.JSONObject;


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
		StringBuilder newUrl = new StringBuilder();
		
		newUrl.append("https://maps.googleapis.com/maps/api/geocode/json?address=");
		newUrl.append(URLEncoder.encode (address, ENCODING));
		newUrl.append("&sensor=false");
		
		if(googlemaps.proxies.constants.Constants.getAPI_Key().length() > 0) {
			newUrl.append("&key=");
			newUrl.append(googlemaps.proxies.constants.Constants.getAPI_Key());
		}
		
		Location location = null;
		
		Core.getLogger("GoogleMapsModule").trace(newUrl);

		
		BufferedReader in = new BufferedReader (
			new InputStreamReader (
				new URL (newUrl.toString())
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
		
		String error_message;
		
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
			error_message = json.getString("error_message");
			Core.getLogger("GoogleMapsModule").error(jsonstatus +": " + error_message);
		}
		
		return location;
		
	}
}