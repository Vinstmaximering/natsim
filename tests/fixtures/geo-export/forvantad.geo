FileHeader "SBG Object Text v2.01","Coordinate Document","UTF-8"
begin
	FileInfo "Application","NätSim 0.6.0"
	FileInfo "Description","Testlager"
	FileInfo "Coordinate System","Sweref 99 20 15 / RH2000 (SWEN17)"
end
PointList 
begin
	Point "T1",6600000.0000,150000.0000,10.2500,,,
	Point "T2",6600010.5000,150020.1234,,,,
end
LineList 
begin
	Line "Kantbalk N",,,
	begin
		PointList 
		begin
			Point "01",6600001.0000,150001.0000,11.0000,,,
			Point "02",6600005.0000,150004.0000,12.5000,,,
		end
	end
	Line "Sluten",,,
	begin
		PointList 
		begin
			Point "01",6600020.0000,150030.0000,,,,
			Point "02",6600020.0000,150040.0000,9.0000,,,
			Point "03",6600030.0000,150040.0000,,,,
			Point "04",6600020.0000,150030.0000,,,,
		end
	end
	Line "Platta",,,
	begin
		PointList 
		begin
			Point "01",6600050.0000,150050.0000,8.0000,,,
			Point "02",6600050.0000,150060.0000,8.0000,,,
			Point "03",6600060.0000,150060.0000,8.0000,,,
			Point "04",6600060.0000,150050.0000,8.0000,,,
			Point "05",6600050.0000,150050.0000,8.0000,,,
		end
	end
end
AttributeList 
